import { createWorkflowForSession, db, type Item, type Session } from '@server/db.js';
import { externalIdForPr, parseGithubPrUrl, upsertGithubPr } from '@server/integrations/github.js';
import { buildJiraIssueContext, createJiraIssue, updateJiraIssue, upsertJiraIssue } from '@server/integrations/jira.js';
import { abortSession, getSessionEmitter } from '@server/worker/events.js';
import {
  commitAll,
  createPrViaGh,
  diffAgainst,
  editPrViaGh,
  hasChanges,
  intentToAddAll,
  pushBranch,
} from '@server/worker/git.js';
import { DEFAULT_PROMPT_ID, isPromptId } from '@server/worker/prompt.js';
import { deleteSessionFolder, enqueueFollowup, enqueueSession } from '@server/worker/runner.js';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const sessions = new Hono();

function getSession(sessionId: number): Session | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Session | undefined;
}

function activeSessionForItem(itemId: number): Session | undefined {
  return db
    .prepare(`SELECT * FROM sessions WHERE item_id = ? AND status IN ('queued','running') ORDER BY id DESC LIMIT 1`)
    .get(itemId) as Session | undefined;
}

// POST /api/items/:id/sessions — start a single session
sessions.post('/items/:id/sessions', async c => {
  const itemId = Number(c.req.param('id'));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(itemId) as Item | undefined;
  if (!item) return c.json({ error: 'item not found' }, 404);

  const body = await c.req
    .json<{ prompt?: string; targetRepo?: string }>()
    .catch(() => ({}) as { prompt?: string; targetRepo?: string });
  const prompt = body.prompt && isPromptId(body.prompt) ? body.prompt : DEFAULT_PROMPT_ID;
  const targetRepo = (body.targetRepo ?? '').trim();
  if (!targetRepo) return c.json({ error: 'targetRepo is required' }, 400);

  if (activeSessionForItem(itemId)) {
    return c.json({ error: 'Item already has an active session' }, 409);
  }

  // Jira-driven PR sessions are orphaned: the session's eventual item is the
  // GitHub PR it produces, not the originating Jira issue. The issue content
  // is captured in user_context so the runner doesn't need item_id to render
  // the prompt. Sentry sessions still own their item.
  const isJira = item.type === 'jira_issue';
  const sessionItemId: number | null = isJira ? null : itemId;
  const userContext: string | null = isJira ? buildJiraIssueContext(item) : null;

  const res = db
    .prepare(
      `INSERT INTO sessions (item_id, source_id, user_context, target_repo, status, prompt) VALUES (?, ?, ?, ?, 'queued', ?)`,
    )
    .run(sessionItemId, item.source_id, userContext, targetRepo, prompt);
  const sessionId = Number(res.lastInsertRowid);
  createWorkflowForSession(sessionId, itemId);

  const session = getSession(sessionId);
  enqueueSession(sessionId);
  return c.json(session);
});

// GET /api/items/:id/sessions — list all sessions for an item
sessions.get('/items/:id/sessions', c => {
  const itemId = Number(c.req.param('id'));
  const rows = db.prepare(`SELECT * FROM sessions WHERE item_id = ? ORDER BY id DESC`).all(itemId) as Session[];
  return c.json(rows);
});

// GET /api/sessions/:id — fetch a session
sessions.get('/sessions/:id', c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  return c.json(session);
});

// DELETE /api/sessions/:id — delete session record + clone folder
sessions.delete('/sessions/:id', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (session.status === 'queued' || session.status === 'running') {
    return c.json({ error: 'cannot delete an active session; abort first' }, 409);
  }
  const folder_deleted = await deleteSessionFolder(sessionId).catch(() => false);
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  return c.json({ ok: true, folder_deleted });
});

// POST /api/sessions/:id/abort
sessions.post('/sessions/:id/abort', c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  const killed = abortSession(sessionId);
  if (session.status === 'queued') {
    db.prepare(`UPDATE sessions SET status = 'aborted', finished_at = datetime('now') WHERE id = ?`).run(sessionId);
  }
  return c.json({ ok: true, killed });
});

// GET /api/sessions/:id/log — SSE stream of logs (replays existing log file, then live)
sessions.get('/sessions/:id/log', c => {
  const sessionId = Number(c.req.param('id'));
  return streamSSE(c, async stream => {
    const session = getSession(sessionId);
    if (!session) {
      await stream.writeSSE({ event: 'end', data: '' });
      return;
    }
    if (session.log_path && existsSync(session.log_path)) {
      try {
        const existing = await readFile(session.log_path, 'utf8');
        if (existing) await stream.writeSSE({ event: 'log', data: existing });
      } catch {
        /* ignore */
      }
    }
    if (session.status !== 'queued' && session.status !== 'running') {
      await stream.writeSSE({ event: 'end', data: '' });
      return;
    }
    const emitter = getSessionEmitter(sessionId);
    let ended = false;
    const onLog = (chunk: string) => {
      void stream.writeSSE({ event: 'log', data: chunk }).catch(() => undefined);
    };
    const onEnd = () => {
      ended = true;
      void stream.writeSSE({ event: 'end', data: '' }).catch(() => undefined);
    };
    emitter.on('log', onLog);
    emitter.on('end', onEnd);
    // Race: the session may have ended between the status check above and attaching the
    // listener — emitSessionEnd fires 'end' then drops the emitter, so we'd be subscribed
    // to a fresh empty one and hang. Re-check status now; if it's terminal, the event is
    // already gone, so synthesize 'end' ourselves.
    const recheck = getSession(sessionId);
    if (!recheck || (recheck.status !== 'queued' && recheck.status !== 'running')) {
      onEnd();
    }
    try {
      while (!ended && !stream.aborted) {
        await stream.sleep(1000);
      }
    } finally {
      emitter.off('log', onLog);
      emitter.off('end', onEnd);
    }
  });
});

// GET /api/sessions/:id/diff — combined diff vs default base
sessions.get('/sessions/:id/diff', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.text('not found', 404);
  if (!session.clone_path || !existsSync(session.clone_path)) return c.text('', 200);
  try {
    await intentToAddAll(session.clone_path);
    // Diff against the merge-base of the branch with origin/HEAD; fallback to origin/HEAD itself.
    const base = 'origin/HEAD';
    const out = await diffAgainst(session.clone_path, base);
    return c.text(out, 200);
  } catch (e) {
    return c.text(e instanceof Error ? e.message : String(e), 500);
  }
});

function bodyFile(session: Session): MetaFile {
  return session.type === 'jira_issue' ? 'JIRA_DESCRIPTION.md' : 'PR_BODY.md';
}

function titleFile(session: Session): MetaFile {
  return session.type === 'jira_issue' ? 'JIRA_TITLE.txt' : 'COMMIT_MSG.txt';
}

// GET /api/sessions/:id/pr-body — read description file (PR or Jira) from the clone
sessions.get('/sessions/:id/pr-body', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.text('not found', 404);
  return c.text(await readMetaFile(session, bodyFile(session)), 200);
});

// PUT /api/sessions/:id/pr-body — write description file
sessions.put('/sessions/:id/pr-body', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (!session.clone_path || !existsSync(session.clone_path)) return c.json({ error: 'no clone path' }, 409);
  const { content } = await c.req.json<{ content: string }>();
  await writeFile(resolve(session.clone_path, bodyFile(session)), content, 'utf8');
  return c.json({ ok: true });
});

// GET /api/sessions/:id/commit-message — read title file (commit subject or Jira summary)
sessions.get('/sessions/:id/commit-message', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.text('not found', 404);
  return c.text(await readMetaFile(session, titleFile(session)), 200);
});

// PUT /api/sessions/:id/commit-message — write title file
sessions.put('/sessions/:id/commit-message', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (!session.clone_path || !existsSync(session.clone_path)) return c.json({ error: 'no clone path' }, 409);
  const { content } = await c.req.json<{ content: string }>();
  await writeFile(resolve(session.clone_path, titleFile(session)), content, 'utf8');
  return c.json({ ok: true });
});

// POST /api/sessions/:id/create-jira-issue — read draft files, create Jira issue, store URL on session
sessions.post('/sessions/:id/create-jira-issue', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (session.type !== 'jira_issue') return c.json({ error: 'session is not a Jira draft' }, 409);
  if (session.pr_url) return c.json({ error: 'Jira issue already created' }, 409);
  if (!session.source_id) return c.json({ error: 'session has no source' }, 409);
  if (!session.clone_path || !existsSync(session.clone_path)) return c.json({ error: 'no workspace path' }, 409);

  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(session.source_id) as
    | { external_id: string }
    | undefined;
  if (!source) return c.json({ error: 'source not found' }, 404);

  try {
    const summary = (await readMetaFile(session, 'JIRA_TITLE.txt')).trim();
    const description = (await readMetaFile(session, 'JIRA_DESCRIPTION.md')).trim();
    if (!summary) return c.json({ error: 'JIRA_TITLE.txt is empty' }, 400);
    const created = await createJiraIssue(source.external_id, summary, description);
    db.prepare(`UPDATE sessions SET pr_url = ? WHERE id = ?`).run(created.url, sessionId);
    // Best-effort: pull the new issue into the local items table so it appears in the Items list
    // immediately. Don't fail the response if this call hiccups — the issue has been created.
    if (session.source_id) {
      try {
        await upsertJiraIssue(session.source_id, created.key);
        if (session.workflow_id) {
          db.prepare(`UPDATE items SET workflow_id = ? WHERE source_id = ? AND external_id = ?`).run(
            session.workflow_id,
            session.source_id,
            created.key,
          );
        }
        db.prepare(
          `UPDATE sessions SET item_id = (SELECT id FROM items WHERE source_id = ? AND external_id = ?) WHERE id = ?`,
        ).run(session.source_id, created.key, sessionId);
      } catch (e) {
        console.warn(`[jira] post-create upsert failed for ${created.key}:`, e);
      }
    }
    return c.json(getSession(sessionId));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// POST /api/sessions/:id/update-jira-issue — push edited JIRA_TITLE.txt and JIRA_DESCRIPTION.md to the existing issue
sessions.post('/sessions/:id/update-jira-issue', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (session.type !== 'jira_issue') return c.json({ error: 'session is not a Jira draft' }, 409);
  if (!session.pr_url) return c.json({ error: 'Jira issue not created yet' }, 409);
  if (!session.item_id) return c.json({ error: 'session not linked to Jira item' }, 409);
  if (!session.clone_path || !existsSync(session.clone_path)) return c.json({ error: 'no workspace path' }, 409);

  const item = db.prepare(`SELECT external_id, source_id FROM items WHERE id = ?`).get(session.item_id) as
    | { external_id: string; source_id: number }
    | undefined;
  if (!item) return c.json({ error: 'item not found' }, 404);

  try {
    const summary = (await readMetaFile(session, 'JIRA_TITLE.txt')).trim();
    const description = (await readMetaFile(session, 'JIRA_DESCRIPTION.md')).trim();
    if (!summary) return c.json({ error: 'JIRA_TITLE.txt is empty' }, 400);
    await updateJiraIssue(item.external_id, summary, description);
    try {
      await upsertJiraIssue(item.source_id, item.external_id);
    } catch (e) {
      console.warn(`[jira] post-update refresh failed for ${item.external_id}:`, e);
    }
    return c.json(getSession(sessionId));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// POST /api/sessions/:id/create-github-pr — commit COMMIT_MSG.txt, push, open PR with PR_BODY.md
sessions.post('/sessions/:id/create-github-pr', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (!session.clone_path || !session.branch || !existsSync(session.clone_path)) {
    return c.json({ error: 'no clone path' }, 409);
  }

  try {
    const commitMsg = (await readMetaFile(session, 'COMMIT_MSG.txt')).trim() || 'claude: changes';
    const prBody = (await readMetaFile(session, 'PR_BODY.md')).trim();
    await intentToAddAll(session.clone_path);
    if (await hasChanges(session.clone_path)) {
      await commitAll(session.clone_path, commitMsg);
    }
    await pushBranch(session.clone_path, session.branch);
    const title = commitMsg.split(/\r?\n/)[0]?.trim() || 'claude: changes';
    if (session.pr_url) {
      await editPrViaGh(session.clone_path, session.pr_url, title, prBody);
      const parsed = parseGithubPrUrl(session.pr_url);
      if (parsed) {
        try {
          const ghSource = db
            .prepare(`SELECT id FROM sources WHERE type = 'github_pr' AND external_id = ?`)
            .get(`${parsed.owner}/${parsed.repo}`) as { id: number } | undefined;
          if (ghSource) await upsertGithubPr(ghSource.id, parsed.owner, parsed.repo, parsed.number);
        } catch (e) {
          console.warn(`[github] post-edit refresh failed for ${session.pr_url}:`, e);
        }
      }
    } else {
      const url = await createPrViaGh(session.clone_path, session.branch, title, prBody);
      db.prepare(`UPDATE sessions SET pr_url = ? WHERE id = ?`).run(url, sessionId);
      // Best-effort: pull the new PR into the local items table so it appears in the Items list
      // immediately. Don't fail the response if this hiccups — the PR has been created.
      const parsed = parseGithubPrUrl(url);
      if (parsed) {
        try {
          const ghSource = db
            .prepare(`SELECT id FROM sources WHERE type = 'github_pr' AND external_id = ?`)
            .get(`${parsed.owner}/${parsed.repo}`) as { id: number } | undefined;
          if (ghSource) {
            await upsertGithubPr(ghSource.id, parsed.owner, parsed.repo, parsed.number);
            const prExternalId = externalIdForPr(parsed.owner, parsed.repo, parsed.number);
            if (session.workflow_id) {
              db.prepare(`UPDATE items SET workflow_id = ? WHERE source_id = ? AND external_id = ?`).run(
                session.workflow_id,
                ghSource.id,
                prExternalId,
              );
            }
            db.prepare(
              `UPDATE sessions SET item_id = (SELECT id FROM items WHERE source_id = ? AND external_id = ?) WHERE id = ?`,
            ).run(ghSource.id, prExternalId, sessionId);
          }
        } catch (e) {
          console.warn(`[github] post-create upsert failed for ${url}:`, e);
        }
      }
    }
    return c.json(getSession(sessionId));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

type MetaFile = 'COMMIT_MSG.txt' | 'PR_BODY.md' | 'JIRA_TITLE.txt' | 'JIRA_DESCRIPTION.md';

async function readMetaFile(session: Session, name: MetaFile): Promise<string> {
  if (!session.clone_path || !existsSync(session.clone_path)) return '';
  try {
    return await readFile(resolve(session.clone_path, name), 'utf8');
  } catch {
    return '';
  }
}

// POST /api/sessions/:id/followup — resume the Claude session with another turn
sessions.post('/sessions/:id/followup', async c => {
  const sessionId = Number(c.req.param('id'));
  const session = getSession(sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  if (session.status === 'queued' || session.status === 'running') {
    return c.json({ error: 'session is busy — abort or wait' }, 409);
  }
  if (!session.claude_session_id) return c.json({ error: 'no claude session to resume' }, 409);
  if (!session.clone_path || !existsSync(session.clone_path)) {
    return c.json({ error: 'clone path missing' }, 409);
  }

  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  const message = (body.message ?? '').trim();
  if (!message) return c.json({ error: 'message required' }, 400);

  db.prepare(
    `UPDATE sessions SET status = 'queued', finished_at = NULL, exit_code = NULL, error = NULL WHERE id = ?`,
  ).run(sessionId);
  enqueueFollowup(sessionId, message);
  return c.json(getSession(sessionId));
});
