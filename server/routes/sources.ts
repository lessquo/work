import {
  createFlowForItem,
  createFlowForSession,
  db,
  type Item,
  type ItemType,
  type Session,
  type Source,
} from '@server/db.js';
import { syncGithubSource } from '@server/integrations/github.js';
import { buildJiraIssueContext, syncJiraSource } from '@server/integrations/jira.js';
import {
  commentOnSentryIssue,
  getSentryCurrentUsername,
  resolveSentryIssue,
  syncSentrySource,
} from '@server/integrations/sentry.js';
import { getSyncLimit } from '@server/settings.js';
import { DEFAULT_JIRA_PROMPT_ID, DEFAULT_PROMPT_ID, isPromptId } from '@server/worker/prompt.js';
import { deleteSessionFolder, enqueueSession } from '@server/worker/runner.js';
import { Hono } from 'hono';

const SOURCE_TYPES: ItemType[] = ['sentry_issue', 'jira_issue', 'github_pr'];

export const sources = new Hono();

sources.get('/', c => {
  const rows = db.prepare(`SELECT * FROM sources ORDER BY type ASC, external_id ASC`).all();
  return c.json(rows);
});

sources.post('/', async c => {
  const body = await c.req.json<Partial<Source>>();
  const type = body.type;
  const externalId = body.external_id?.trim();
  if (!type || !SOURCE_TYPES.includes(type)) {
    return c.json({ error: 'type must be one of sentry_issue, jira_issue, github_pr' }, 400);
  }
  if (!externalId) {
    return c.json({ error: 'external_id required' }, 400);
  }
  const res = db.prepare(`INSERT INTO sources (type, external_id) VALUES (?, ?)`).run(type, externalId);
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
  const status = parseStatus(c.req.query('status'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const statusClause = buildStatusClause(source.type, status);
  if (statusClause === null) return c.json([]);

  const sort = c.req.query('sort') === 'title' ? 'title' : 'recency';
  const order = buildOrderClause(source.type, status, sort);

  const rows = db
    .prepare(
      `SELECT
         i.*,
         COALESCE((
           SELECT json_group_array(json_object('id', r.id, 'status', r.status))
           FROM (SELECT id, status FROM sessions WHERE item_id = i.id ORDER BY id DESC) r
         ), '[]') AS sessions,
         (SELECT COUNT(*) FROM notes WHERE item_id = i.id) AS note_count
       FROM items i
       WHERE i.source_id = ? ${statusClause}
       ORDER BY ${order}`,
    )
    .all(id) as Array<Item & { sessions: string; note_count: number }>;
  return c.json(
    rows.map(r => ({
      ...r,
      sessions: JSON.parse(r.sessions),
    })),
  );
});

type Status = 'open' | 'resolved';

function parseStatus(raw: string | undefined): Status {
  return raw === 'resolved' ? 'resolved' : 'open';
}

type Sort = 'recency' | 'title';

// Returns the SQL ORDER BY fragment for the given (type, status, sort). The
// recency sort uses upstream timestamps from raw — the local items.updated_at
// reflects the last sync, not when the item itself changed upstream, and is
// near-identical for every item in a sync batch (datetime('now') has 1s res).
function buildOrderClause(type: ItemType, status: Status, sort: Sort): string {
  if (sort === 'title') {
    const titleKey = type === 'jira_issue' ? '$.summary' : type === 'notes' ? '$.name' : '$.title';
    return `json_extract(i.raw, '${titleKey}') COLLATE NOCASE ASC, i.id DESC`;
  }
  const expr = recencyExpr(type, status);
  return `${expr} DESC, i.id DESC`;
}

function recencyExpr(type: ItemType, status: Status): string {
  if (type === 'sentry_issue') {
    return `json_extract(i.raw, '$.lastSeen')`;
  }
  if (type === 'jira_issue') {
    return `json_extract(i.raw, '$.updated')`;
  }
  if (type === 'notes') {
    return `i.updated_at`;
  }
  // github_pr: closed tab prefers mergedAt (closed-not-merged falls back to updatedAt).
  if (status === 'resolved') {
    return `COALESCE(json_extract(i.raw, '$.mergedAt'), json_extract(i.raw, '$.updatedAt'))`;
  }
  return `json_extract(i.raw, '$.updatedAt')`;
}

// Returns the SQL fragment to AND into the WHERE clause, or null when the
// (type, status) combination should yield zero rows.
function buildStatusClause(type: ItemType, status: Status): string | null {
  if (type === 'github_pr') {
    return status === 'open'
      ? `AND json_extract(i.raw, '$.state') = 'OPEN'`
      : `AND json_extract(i.raw, '$.state') IN ('CLOSED','MERGED')`;
  }
  if (type === 'jira_issue') {
    return status === 'open'
      ? `AND json_extract(i.raw, '$.status_category') != 'done'`
      : `AND json_extract(i.raw, '$.status_category') = 'done'`;
  }
  if (type === 'sentry_issue') {
    return status === 'open'
      ? `AND json_extract(i.raw, '$.status') = 'unresolved'`
      : `AND json_extract(i.raw, '$.status') = 'resolved'`;
  }
  if (type === 'notes') {
    // Notebooks have no "open/resolved" state — show all rows on the open tab, none on resolved.
    return status === 'open' ? '' : null;
  }
  return '';
}

sources.get('/:id/counts', c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);
  const count = (clause: string | null): number => {
    if (clause === null) return 0;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM items i WHERE i.source_id = ? ${clause}`).get(id) as {
      n: number;
    };
    return row.n;
  };
  return c.json({
    open: count(buildStatusClause(source.type, 'open')),
    resolved: count(buildStatusClause(source.type, 'resolved')),
  });
});

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
      errors.push(`${item.external_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({ resolved, skipped, errors });
});

sources.post('/:id/session-items', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const body = await c.req
    .json<{ itemIds?: number[]; prompt?: string; targetRepo?: string }>()
    .catch(() => ({}) as { itemIds?: number[]; prompt?: string; targetRepo?: string });
  const ids = Array.isArray(body.itemIds) ? body.itemIds.filter(n => Number.isInteger(n)) : [];
  const prompt = body.prompt && isPromptId(body.prompt) ? body.prompt : DEFAULT_PROMPT_ID;
  const targetRepo = (body.targetRepo ?? '').trim();
  if (!targetRepo) return c.json({ error: 'targetRepo is required' }, 400);
  if (ids.length === 0) return c.json({ enqueued: 0, skipped: 0 });

  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT * FROM items WHERE source_id = ? AND id IN (${placeholders})`)
    .all(id, ...ids) as Item[];

  const insert = db.prepare(
    `INSERT INTO sessions (item_id, source_id, user_context, target_repo, status, prompt) VALUES (?, ?, ?, ?, 'queued', ?)`,
  );
  const hasActive = db.prepare(`SELECT 1 FROM sessions WHERE item_id = ? AND status IN ('queued','running') LIMIT 1`);

  let enqueued = 0;
  let skipped = 0;
  for (const it of items) {
    if (hasActive.get(it.id)) {
      skipped++;
      continue;
    }
    const isJira = it.type === 'jira_issue';
    const sessionItemId: number | null = isJira ? null : it.id;
    const userContext: string | null = isJira ? buildJiraIssueContext(it) : null;
    const res = insert.run(sessionItemId, id, userContext, targetRepo, prompt);
    const sessionId = Number(res.lastInsertRowid);
    createFlowForSession(sessionId, it.id);
    enqueueSession(sessionId);
    enqueued++;
  }

  return c.json({ enqueued, skipped });
});

sources.post('/:id/flows-from-items', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json<{ itemIds?: number[] }>().catch(() => ({}) as { itemIds?: number[] });
  const ids = Array.isArray(body.itemIds) ? body.itemIds.filter(n => Number.isInteger(n)) : [];
  if (ids.length === 0) return c.json({ created: 0, flowIds: [] });

  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT id FROM items WHERE source_id = ? AND id IN (${placeholders})`)
    .all(id, ...ids) as Array<{ id: number }>;

  const flowIds: number[] = [];
  for (const it of items) {
    flowIds.push(createFlowForItem(it.id));
  }
  return c.json({ created: flowIds.length, flowIds });
});

sources.get('/:id/sessions', c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);
  const rows = db
    .prepare(
      `SELECT s.*,
              i.external_id AS item_external_id,
              i.type        AS item_type,
              i.url         AS item_url,
              i.raw         AS item_raw
         FROM sessions s
         LEFT JOIN items i ON i.id = s.item_id
        WHERE s.source_id = ? OR i.source_id = ?
        ORDER BY s.id DESC`,
    )
    .all(id, id);
  return c.json(rows);
});

sources.post('/:id/jira-draft-sessions', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);
  if (source.type !== 'jira_issue') return c.json({ error: 'source is not a Jira project' }, 400);

  const body = await c.req
    .json<{ context?: string; prompt?: string; targetRepo?: string }>()
    .catch(() => ({}) as { context?: string; prompt?: string; targetRepo?: string });
  const context = (body.context ?? '').trim();
  if (!context) return c.json({ error: 'context is required' }, 400);
  const prompt = body.prompt && isPromptId(body.prompt) ? body.prompt : DEFAULT_JIRA_PROMPT_ID;
  const targetRepo = (body.targetRepo ?? '').trim() || null;

  const res = db
    .prepare(
      `INSERT INTO sessions (source_id, type, user_context, target_repo, status, prompt) VALUES (?, 'jira_issue', ?, ?, 'queued', ?)`,
    )
    .run(id, context, targetRepo, prompt);
  const sessionId = Number(res.lastInsertRowid);
  createFlowForSession(sessionId);
  enqueueSession(sessionId);
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Session;
  return c.json(session);
});

sources.post('/:id/delete-sessions', async c => {
  const id = Number(c.req.param('id'));
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as Source | undefined;
  if (!source) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json<{ itemIds?: number[] }>().catch(() => ({}) as { itemIds?: number[] });
  const ids = Array.isArray(body.itemIds) ? body.itemIds.filter(n => Number.isInteger(n)) : [];
  if (ids.length === 0) return c.json({ deleted: 0, skipped_active: 0, no_run: 0, folder_errors: [] });

  const latestStmt = db.prepare(`SELECT * FROM sessions WHERE item_id = ? ORDER BY id DESC LIMIT 1`);
  const deleteStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);

  let deleted = 0;
  let skipped_active = 0;
  let no_run = 0;
  const folder_errors: string[] = [];

  for (const itemId of ids) {
    const session = latestStmt.get(itemId) as Session | undefined;
    if (!session) {
      no_run++;
      continue;
    }
    if (session.status === 'queued' || session.status === 'running') {
      skipped_active++;
      continue;
    }
    try {
      await deleteSessionFolder(session.id);
    } catch (e) {
      folder_errors.push(`session ${session.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    deleteStmt.run(session.id);
    deleted++;
  }

  return c.json({ deleted, skipped_active, no_run, folder_errors });
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
      await commentOnSentryIssue(item.external_id, text);
    }
    await resolveSentryIssue(item.external_id, { assignTo });
    const raw = safeParse(item.raw);
    raw.status = 'resolved';
    db.prepare(`UPDATE items SET raw = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(raw), item.id);
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
    case 'notes':
      // Notes are user-authored locally; no upstream to sync.
      return Promise.resolve(0);
  }
}
