import { createFlowForSession, db, type Item, type ItemType, type Source } from '@server/db.js';
import { syncGithubSource } from '@server/integrations/github.js';
import { buildJiraIssueContext, syncJiraSource } from '@server/integrations/jira.js';
import {
  buildSentryIssueContext,
  commentOnSentryIssue,
  getSentryCurrentUsername,
  resolveSentryIssue,
  syncSentrySource,
} from '@server/integrations/sentry.js';
import { getSyncLimit } from '@server/settings.js';
import { DEFAULT_PROMPT_ID, isPromptId } from '@server/worker/prompt.js';
import { enqueueSession } from '@server/worker/runner.js';
import { Hono } from 'hono';

const SOURCE_TYPES: ItemType[] = ['sentry_issue', 'jira_issue', 'github_pr'];

export const sources = new Hono();

sources.get('/', c => {
  const rows = db.prepare(`SELECT * FROM sources ORDER BY type ASC, ext_id ASC`).all();
  return c.json(rows);
});

sources.post('/', async c => {
  const body = await c.req.json<Partial<Source>>();
  const type = body.type;
  const extId = body.ext_id?.trim();
  if (!type || !SOURCE_TYPES.includes(type)) {
    return c.json({ error: 'type must be one of sentry_issue, jira_issue, github_pr' }, 400);
  }
  if (!extId) {
    return c.json({ error: 'ext_id required' }, 400);
  }
  const res = db.prepare(`INSERT INTO sources (type, ext_id) VALUES (?, ?)`).run(type, extId);
  const row = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(res.lastInsertRowid) as Source;
  return c.json(row, 201);
});

sources.get('/:id', c => {
  const id = Number(c.req.param('id'));
  const row = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

sources.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  db.prepare(`DELETE FROM sources WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

sources.get('/:id/items', c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const rows = db
    .prepare(
      `SELECT
         i.*,
         COALESCE((
           SELECT json_group_array(json_object('id', r.id, 'status', r.status))
           FROM (SELECT id, status FROM sessions WHERE item_id = i.id ORDER BY id DESC) r
         ), '[]') AS sessions
       FROM items i
       WHERE i.source_id = ?
       ORDER BY ${recencyExpr(source.type)} DESC, i.id DESC`,
    )
    .all(id) as Array<Item & { sessions: string }>;
  return c.json(
    rows.map(r => ({
      ...r,
      sessions: JSON.parse(r.sessions),
    })),
  );
});

// Recency uses upstream timestamps from raw — the local items.updated_at
// reflects the last sync, not when the item itself changed upstream, and is
// near-identical for every item in a sync batch (datetime('now') has 1s res).
function recencyExpr(type: ItemType): string {
  if (type === 'sentry_issue') return `json_extract(i.raw, '$.lastSeen')`;
  if (type === 'jira_issue') return `json_extract(i.raw, '$.updated')`;
  if (type === 'plan') return `i.updated_at`;
  // github_pr: prefer mergedAt for closed-merged PRs, fall back to updatedAt.
  return `COALESCE(json_extract(i.raw, '$.mergedAt'), json_extract(i.raw, '$.updatedAt'))`;
}

sources.post('/:id/resolve-items', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ itemIds?: number[] }>();
  const ids = Array.isArray(body.itemIds) ? body.itemIds.filter(n => Number.isInteger(n)) : [];
  if (ids.length === 0) return c.json({ resolved: 0, skipped: 0, errors: [] });

  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT * FROM items WHERE source_id = ? AND id IN (${placeholders})`)
    .all(id, ...ids) as Item[];

  let resolved = 0;
  let skipped = 0;
  const errors: string[] = [];

  let assignee: string | null = null;
  if (source.type === 'sentry_issue') {
    assignee = await getSentryCurrentUsername();
    if (!assignee) {
      return c.json({
        resolved: 0,
        skipped: 0,
        errors: ['Sentry /users/me/ returned no username — the auth token is not tied to a user.'],
      });
    }
  }

  for (const item of items) {
    try {
      const ok = await resolveItemUpstream(source, item, assignee);
      if (ok) resolved++;
      else skipped++;
    } catch (e) {
      errors.push(`${item.ext_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({ resolved, skipped, errors });
});

sources.post('/:id/session-items', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const body = await c.req
    .json<{ itemIds?: number[]; prompt?: string; repo?: string }>()
    .catch(() => ({}) as { itemIds?: number[]; prompt?: string; repo?: string });
  const ids = Array.isArray(body.itemIds) ? body.itemIds.filter(n => Number.isInteger(n)) : [];
  const prompt = body.prompt && isPromptId(body.prompt) ? body.prompt : DEFAULT_PROMPT_ID;
  const repo = (body.repo ?? '').trim();
  if (!repo) return c.json({ error: 'repo is required' }, 400);
  if (ids.length === 0) return c.json({ enqueued: 0, skipped: 0 });

  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT * FROM items WHERE source_id = ? AND id IN (${placeholders})`)
    .all(id, ...ids) as Item[];

  const insert = db.prepare(
    `INSERT INTO sessions (item_id, source_id, user_context, repo, status, prompt) VALUES (?, ?, ?, ?, 'queued', ?)`,
  );
  const hasActive = db.prepare(`SELECT 1 FROM sessions WHERE item_id = ? AND status IN ('queued','running') LIMIT 1`);

  let enqueued = 0;
  let skipped = 0;
  for (const it of items) {
    if (hasActive.get(it.id)) {
      skipped++;
      continue;
    }
    const userContext: string | null =
      it.type === 'jira_issue'
        ? buildJiraIssueContext(it)
        : it.type === 'sentry_issue'
          ? buildSentryIssueContext(it)
          : null;
    const sessionItemId: number | null = userContext === null ? it.id : null;
    const res = insert.run(sessionItemId, id, userContext, repo, prompt);
    const sessionId = Number(res.lastInsertRowid);
    createFlowForSession(sessionId, it.id);
    enqueueSession(sessionId);
    enqueued++;
  }

  return c.json({ enqueued, skipped });
});

async function resolveItemUpstream(source: Source, item: Item, assignTo: string | null): Promise<boolean> {
  if (source.type === 'sentry_issue') {
    const prUrls = item.flow_id
      ? (db
          .prepare(`SELECT url FROM items WHERE flow_id = ? AND type = 'github_pr' AND id != ?`)
          .all(item.flow_id, item.id) as Array<{ url: string }>)
      : [];
    if (prUrls.length > 0) {
      const text =
        prUrls.length === 1
          ? `Resolved by ${prUrls[0].url}`
          : 'Resolved by:\n' + prUrls.map(p => `- ${p.url}`).join('\n');
      await commentOnSentryIssue(item.ext_id, text);
    }
    await resolveSentryIssue(item.ext_id, { assignTo });
    const raw = safeParse(item.raw);
    raw.status = 'resolved';
    db.prepare(`UPDATE items SET raw = ?, status = 'resolved', updated_at = datetime('now') WHERE id = ?`).run(
      JSON.stringify(raw),
      item.id,
    );
    return true;
  }
  return false;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

sources.post('/:id/sync', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);
  try {
    const synced = await runSync(source);
    return c.json({ synced });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

function runSync(source: Source): Promise<number> {
  const limit = getSyncLimit();
  switch (source.type) {
    case 'sentry_issue':
      return syncSentrySource(source, limit);
    case 'github_pr':
      return syncGithubSource(source, limit);
    case 'jira_issue':
      return syncJiraSource(source, limit);
    case 'plan':
      // Local-only sources are user-authored; no upstream to sync.
      return Promise.resolve(0);
  }
}
