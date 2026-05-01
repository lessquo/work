import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { db, listNotes, sessionColumns, sessionFrom, syncNotesForItem, type Item, type Session } from '@server/db.js';
import { getMaxParallel } from '@server/settings.js';
import { emitSessionEnd, emitSessionLog, registerSessionAbort, unregisterSessionAbort } from '@server/worker/events.js';
import { checkoutNewBranch, hasChanges, intentToAddAll, prepareClone } from '@server/worker/git.js';
import { renderPrompt } from '@server/worker/prompt.js';
import { existsSync, mkdirSync } from 'node:fs';
import { appendFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PQueue from 'p-queue';

let queueInstance: PQueue | null = null;

function getQueue(): PQueue {
  if (!queueInstance) {
    queueInstance = new PQueue({ concurrency: getMaxParallel() });
  }
  return queueInstance;
}

export function setRunnerConcurrency(n: number): void {
  getQueue().concurrency = Math.min(8, Math.max(1, Math.floor(n)));
}

export function getRunnerStats() {
  const q = getQueue();
  return { size: q.size, pending: q.pending, concurrency: q.concurrency };
}

export function enqueueSession(sessionId: number): void {
  void getQueue().add(() => runJob(sessionId));
}

export function enqueueFollowup(sessionId: number, message: string): void {
  void getQueue().add(() => runFollowupJob(sessionId, message));
}

const CLONES_ROOT = resolve(process.cwd(), 'clones');
const LOGS_ROOT = resolve(process.cwd(), 'logs');

function clonePathFor(sessionId: number): string {
  return resolve(CLONES_ROOT, `session-${sessionId}`);
}

function logPathFor(sessionId: number): string {
  return resolve(LOGS_ROOT, `session-${sessionId}.log`);
}

function currentStatus(sessionId: number): string | undefined {
  const row = db.prepare(`SELECT status FROM sessions WHERE id = ?`).get(sessionId) as { status: string } | undefined;
  return row?.status;
}

function safeBranchSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'work'
  );
}

async function buildPrompt(item: Item, promptId: string): Promise<string> {
  const raw = (() => {
    try {
      return JSON.parse(item.raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  return renderPrompt(
    {
      sentry_url: item.url,
      shortId: typeof raw.shortId === 'string' ? raw.shortId : item.external_id,
      issueId: item.external_id,
    },
    promptId,
  );
}

// Orphan Jira PR sessions carry the issue reference in user_context — either as
// `[KEY](URL)` (written by buildJiraIssueContext) or as a raw `.../browse/KEY`
// URL pasted by the user. We pull KEY back out for the branch name so the PR
// has a readable slug.
function extractJiraKey(userContext: string | null): string | null {
  if (!userContext) return null;
  const md = userContext.match(/\[([A-Z][A-Z0-9_]*-\d+)\]/);
  if (md) return md[1];
  const url = userContext.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/);
  return url?.[1] ?? null;
}

type Logger = (chunk: string) => Promise<void>;

// Shared core for an SDK turn (initial run or follow-up). Wrappers prep cwd/logPath,
// supply the row-transition SQL via `setRunning`, and run preflight (clone + prompt
// build, or a single follow-up log line) which returns the prompt text fed to query().
async function runSDKTurn(opts: {
  sessionId: number;
  cwd: string;
  logPath: string;
  resume?: string;
  initialClaudeSessionId?: string | null;
  skipGit?: boolean;
  setRunning: () => void;
  preflight: (log: Logger) => Promise<string>;
  postSuccess?: (log: Logger) => Promise<void>;
}): Promise<void> {
  const {
    sessionId,
    cwd,
    logPath,
    resume,
    initialClaudeSessionId = null,
    skipGit = false,
    setRunning,
    preflight,
    postSuccess,
  } = opts;

  const log: Logger = async chunk => {
    await appendFile(logPath, chunk).catch(() => undefined);
    emitSessionLog(sessionId, chunk);
  };

  const abortController = new AbortController();
  registerSessionAbort(sessionId, abortController);

  // Honor an /abort that arrived while we were queued — the route wrote
  // status='aborted' to DB but had no controller to fire on yet. Re-read
  // before transitioning to 'running' so the UPDATE doesn't clobber it.
  if (currentStatus(sessionId) === 'aborted') {
    unregisterSessionAbort(sessionId);
    emitSessionEnd(sessionId);
    return;
  }

  setRunning();

  try {
    const promptText = await preflight(log);

    let claudeSessionId: string | null = initialClaudeSessionId;
    const q = query({
      prompt: promptText,
      options: {
        cwd,
        ...(resume ? { resume } : {}),
        abortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // Disable filesystem-based settings discovery — otherwise the SDK walks up
        // from `cwd` and picks up the host app's CLAUDE.md, treating *its* directory
        // as the "workspace root" and writing draft files there instead of `cwd`.
        settingSources: [],
        mcpServers: {
          context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
        },
      },
    });

    for await (const msg of q as AsyncGenerator<SDKMessage>) {
      if (abortController.signal.aborted) break;
      claudeSessionId = (msg as { session_id?: string }).session_id ?? claudeSessionId;
      await log(formatMessage(msg));
    }

    if (abortController.signal.aborted) {
      db.prepare(`UPDATE sessions SET status = 'aborted', claude_session_id = ? WHERE id = ?`).run(
        claudeSessionId,
        sessionId,
      );
      await log(`[${new Date().toISOString()}] aborted\n`);
      return;
    }

    if (!skipGit) {
      await intentToAddAll(cwd);
      if (await hasChanges(cwd)) {
        await log(`[${new Date().toISOString()}] staged changes — commit deferred until you click Create PR\n`);
      } else {
        await log(`[${new Date().toISOString()}] no file changes\n`);
      }
    }

    if (postSuccess) {
      try {
        await postSuccess(log);
      } catch (e) {
        await log(
          `[${new Date().toISOString()}] post-run hook failed: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }
    }

    db.prepare(
      `UPDATE sessions
         SET status = 'succeeded', claude_session_id = ?
       WHERE id = ?`,
    ).run(claudeSessionId, sessionId);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await log(`[${new Date().toISOString()}] error: ${errMsg}\n`);
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run(errMsg, sessionId);
  } finally {
    unregisterSessionAbort(sessionId);
    emitSessionEnd(sessionId);
  }
}

async function runJob(sessionId: number): Promise<void> {
  const session = db.prepare(`SELECT ${sessionColumns} FROM ${sessionFrom} WHERE s.id = ?`).get(sessionId) as
    | Session
    | undefined;
  if (!session) return;
  if (session.status === 'aborted') return;

  if (session.source_type === 'jira_issue') {
    await runJiraDraftJob(sessionId, session);
    return;
  }

  if (session.source_type === 'notes') {
    await runNotesJob(sessionId, session);
    return;
  }

  if (!session.target_repo) {
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run(
      'target_repo is required for PR sessions',
      sessionId,
    );
    emitSessionEnd(sessionId);
    return;
  }
  const targetRepo = session.target_repo;

  let branch: string;
  let buildPromptText: () => Promise<string>;

  if (session.item_id) {
    const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(session.item_id) as Item | undefined;
    if (!item) {
      db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run('Item not found', sessionId);
      emitSessionEnd(sessionId);
      return;
    }
    branch = `${safeBranchSlug(item.external_id)}-${sessionId}`;
    buildPromptText = () => buildPrompt(item, session.prompt);
  } else {
    const issueKey = extractJiraKey(session.user_context);
    branch = issueKey ? `${issueKey}-${sessionId}` : `pr-${sessionId}`;
    const userContext = session.user_context ?? '';
    buildPromptText = () => renderPrompt({ user_context: userContext }, session.prompt);
  }

  mkdirSync(CLONES_ROOT, { recursive: true });
  mkdirSync(LOGS_ROOT, { recursive: true });

  const clonePath = clonePathFor(sessionId);
  const logPath = logPathFor(sessionId);

  await writeFile(logPath, '');

  await runSDKTurn({
    sessionId,
    cwd: clonePath,
    logPath,
    setRunning: () => {
      db.prepare(
        `UPDATE sessions
           SET status = 'running', clone_path = ?, log_path = ?, branch = ?
         WHERE id = ?`,
      ).run(clonePath, logPath, branch, sessionId);
    },
    preflight: async log => {
      await log(`[${new Date().toISOString()}] cloning ${targetRepo} into ${clonePath}\n`);
      if (existsSync(clonePath)) {
        await rm(clonePath, { recursive: true, force: true });
      }
      const { defaultBranch } = await prepareClone(clonePath, targetRepo);
      await checkoutNewBranch(clonePath, branch, defaultBranch);
      await log(`[${new Date().toISOString()}] branched ${branch} from ${defaultBranch}\n`);

      const promptText = await buildPromptText();
      await log(`[${new Date().toISOString()}] prompt: ${session.prompt}\n---\n${promptText}\n---\n`);
      return promptText;
    },
  });
}

async function runJiraDraftJob(sessionId: number, session: Session): Promise<void> {
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(session.source_id) as
    | { external_id: string }
    | undefined;
  if (!source) {
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run('Source not found', sessionId);
    emitSessionEnd(sessionId);
    return;
  }

  mkdirSync(CLONES_ROOT, { recursive: true });
  mkdirSync(LOGS_ROOT, { recursive: true });

  const workspace = clonePathFor(sessionId);
  const logPath = logPathFor(sessionId);

  await writeFile(logPath, '');

  await runSDKTurn({
    sessionId,
    cwd: workspace,
    logPath,
    skipGit: true,
    setRunning: () => {
      db.prepare(
        `UPDATE sessions
           SET status = 'running', clone_path = ?, log_path = ?
         WHERE id = ?`,
      ).run(workspace, logPath, sessionId);
    },
    preflight: async log => {
      if (existsSync(workspace)) {
        await rm(workspace, { recursive: true, force: true });
      }

      let repoNote = 'No repo cloned — base the draft on the user context alone.';
      if (session.target_repo) {
        await log(`[${new Date().toISOString()}] cloning ${session.target_repo} into ${workspace}\n`);
        const { defaultBranch } = await prepareClone(workspace, session.target_repo);
        await log(`[${new Date().toISOString()}] cloned (default branch ${defaultBranch}) — read-only investigation\n`);
        repoNote = `Repo \`${session.target_repo}\` is cloned at the workspace root (default branch \`${defaultBranch}\`). You may read it freely to ground the ticket — but do NOT modify any source files.`;
      } else {
        mkdirSync(workspace, { recursive: true });
        await log(`[${new Date().toISOString()}] workspace ${workspace} (no repo)\n`);
      }

      const promptText = await renderPrompt(
        {
          project_key: source.external_id,
          user_context: session.user_context ?? '',
          repo_note: repoNote,
        },
        session.prompt,
      );
      await log(`[${new Date().toISOString()}] prompt: ${session.prompt}\n---\n${promptText}\n---\n`);
      return promptText;
    },
  });
}

const NOTES_DIRNAME = '.notes';

function noteIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

function parseNoteFile(content: string, externalId: string): { title: string; body_md: string } {
  const trimmed = content.replace(/^\uFEFF/, '');
  const lines = trimmed.split(/\r?\n/);
  let title = externalId;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (ln === '') continue;
    const m = ln.match(/^#\s+(.+)$/);
    if (m) {
      title = m[1].trim();
      bodyStart = i + 1;
    }
    break;
  }
  const body = lines.slice(bodyStart).join('\n').replace(/^\s+/, '');
  return { title, body_md: body };
}

function noteFileContent(title: string, body: string): string {
  return `# ${title}\n\n${body.trim()}\n`;
}

async function materializeNotesIntoDir(itemId: number, notesDir: string): Promise<number> {
  mkdirSync(notesDir, { recursive: true });
  const rows = listNotes(itemId);
  for (const r of rows) {
    await writeFile(resolve(notesDir, `${r.external_id}.md`), noteFileContent(r.title, r.body_md), 'utf8');
  }
  return rows.length;
}

async function syncNotesWorkspace(itemId: number, workspace: string): Promise<number> {
  const notesDir = resolve(workspace, NOTES_DIRNAME);
  if (!existsSync(notesDir)) {
    syncNotesForItem(itemId, []);
    return 0;
  }
  const entries = await readdir(notesDir, { withFileTypes: true });
  const rows: Array<{ external_id: string; title: string; body_md: string }> = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.toLowerCase().endsWith('.md')) continue;
    const content = await readFile(resolve(notesDir, e.name), 'utf8').catch(() => '');
    const externalId = noteIdFromFilename(e.name);
    rows.push({ external_id: externalId, ...parseNoteFile(content, externalId) });
  }
  syncNotesForItem(itemId, rows);
  return rows.length;
}

async function runNotesJob(sessionId: number, session: Session): Promise<void> {
  if (!session.item_id) {
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run(
      'item_id is required for notes sessions',
      sessionId,
    );
    emitSessionEnd(sessionId);
    return;
  }
  const itemId = session.item_id;

  mkdirSync(CLONES_ROOT, { recursive: true });
  mkdirSync(LOGS_ROOT, { recursive: true });

  const workspace = clonePathFor(sessionId);
  const notesDir = resolve(workspace, NOTES_DIRNAME);
  const logPath = logPathFor(sessionId);

  await writeFile(logPath, '');

  await runSDKTurn({
    sessionId,
    cwd: workspace,
    logPath,
    skipGit: true,
    setRunning: () => {
      db.prepare(
        `UPDATE sessions
           SET status = 'running', clone_path = ?, log_path = ?
         WHERE id = ?`,
      ).run(workspace, logPath, sessionId);
    },
    preflight: async log => {
      // Fresh workspace per session — matches the Jira/PR pattern.
      if (existsSync(workspace)) {
        await rm(workspace, { recursive: true, force: true });
      }

      let repoNote = 'No repo cloned — base your notes on the user context alone.';
      if (session.target_repo) {
        await log(`[${new Date().toISOString()}] cloning ${session.target_repo} into ${workspace}\n`);
        const { defaultBranch } = await prepareClone(workspace, session.target_repo);
        await log(`[${new Date().toISOString()}] cloned (default branch ${defaultBranch}) — read-only investigation\n`);
        repoNote = `Repo \`${session.target_repo}\` is cloned at the workspace root (default branch \`${defaultBranch}\`). You may read it freely to ground your notes — but do NOT modify any files in the cloned repo.`;
      } else {
        mkdirSync(workspace, { recursive: true });
        await log(`[${new Date().toISOString()}] workspace ${workspace} (no repo)\n`);
      }

      const existingCount = await materializeNotesIntoDir(itemId, notesDir);
      await log(
        `[${new Date().toISOString()}] materialized ${existingCount} existing note(s) into ./${NOTES_DIRNAME}/\n`,
      );

      const promptText = await renderPrompt(
        {
          user_context: session.user_context ?? '',
          repo_note: repoNote,
        },
        session.prompt,
      );
      await log(`[${new Date().toISOString()}] prompt: ${session.prompt}\n---\n${promptText}\n---\n`);
      return promptText;
    },
    postSuccess: async log => {
      const count = await syncNotesWorkspace(itemId, workspace);
      await log(`[${new Date().toISOString()}] synced ${count} note(s) into the notebook\n`);
    },
  });
}

async function runFollowupJob(sessionId: number, message: string): Promise<void> {
  const session = db.prepare(`SELECT ${sessionColumns} FROM ${sessionFrom} WHERE s.id = ?`).get(sessionId) as
    | Session
    | undefined;
  if (!session) return;
  if (session.status === 'aborted') return;

  if (!session.clone_path || !existsSync(session.clone_path)) {
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run(
      'clone path missing — cannot resume',
      sessionId,
    );
    emitSessionEnd(sessionId);
    return;
  }
  if (!session.claude_session_id) {
    db.prepare(`UPDATE sessions SET status = 'failed', error = ? WHERE id = ?`).run(
      'no claude session to resume',
      sessionId,
    );
    emitSessionEnd(sessionId);
    return;
  }

  const isNotes = session.source_type === 'notes' && session.item_id !== null;
  const notesItemId = isNotes ? session.item_id! : null;
  const workspace = session.clone_path;

  await runSDKTurn({
    sessionId,
    cwd: workspace,
    logPath: session.log_path ?? logPathFor(sessionId),
    resume: session.claude_session_id,
    initialClaudeSessionId: session.claude_session_id,
    skipGit: isNotes,
    setRunning: () => {
      db.prepare(`UPDATE sessions SET status = 'running', error = NULL WHERE id = ?`).run(sessionId);
    },
    preflight: async log => {
      await log(`\n[${new Date().toISOString()}] follow-up: ${message}\n`);
      return message;
    },
    postSuccess: notesItemId
      ? async log => {
          const count = await syncNotesWorkspace(notesItemId, workspace);
          await log(`[${new Date().toISOString()}] synced ${count} note(s) into the notebook\n`);
        }
      : undefined,
  });
}

function formatMessage(msg: SDKMessage): string {
  if (msg.type === 'assistant') {
    const blocks = (msg.message?.content ?? []) as Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
    const out: string[] = [];
    for (const b of blocks) {
      if (b.type === 'text' && b.text) out.push(b.text);
      else if (b.type === 'tool_use') {
        const input = typeof b.input === 'string' ? b.input : JSON.stringify(b.input);
        out.push(`\n[tool: ${b.name}] ${input ?? ''}\n`);
      }
    }
    return out.join('') + '\n';
  }
  if (msg.type === 'result') {
    const r = msg as { subtype?: string; result?: string; is_error?: boolean };
    if (r.subtype === 'success' && r.result) return `\n[result] ${r.result}\n`;
    if (r.is_error) return `\n[result error]\n`;
    return '';
  }
  if (msg.type === 'system') {
    return '';
  }
  return '';
}

export async function deleteSessionFolder(sessionId: number): Promise<boolean> {
  const path = clonePathFor(sessionId);
  if (!existsSync(path)) return false;
  await rm(path, { recursive: true, force: true });
  return true;
}
