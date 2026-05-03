import { db, type Item, type Source } from '@server/db.js';
import { syncGithubItem } from '@server/integrations/github.js';
import { upsertJiraIssue } from '@server/integrations/jira.js';
import { upsertSentryIssue } from '@server/integrations/sentry.js';
import { Hono } from 'hono';

export const items = new Hono();

items.get('/', c => {
  const rows = db
    .prepare(
      `SELECT
         i.*,
         COALESCE((
           SELECT json_group_array(json_object('id', r.id, 'status', r.status))
           FROM (SELECT id, status FROM sessions WHERE item_id = i.id ORDER BY id DESC) r
         ), '[]') AS sessions
       FROM items i`,
    )
    .all() as Array<Item & { sessions: string }>;
  return c.json(rows.map(r => ({ ...r, sessions: JSON.parse(r.sessions) })));
});

items.get('/:id', c => {
  const id = Number(c.req.param('id'));
  const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item | undefined;
  if (!row) return c.json({ error: 'item not found' }, 404);
  return c.json(row);
});

items.put('/:id/flow', async c => {
  const id = Number(c.req.param('id'));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item | undefined;
  if (!item) return c.json({ error: 'item not found' }, 404);

  const body = await c.req.json<{ flowId?: number | null }>().catch(() => ({}) as { flowId?: number | null });
  const flowId = body.flowId ?? null;

  if (flowId !== null) {
    const flow = db.prepare(`SELECT id FROM flows WHERE id = ?`).get(flowId);
    if (!flow) return c.json({ error: 'flow not found' }, 404);
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE items SET flow_id = ? WHERE id = ?`).run(flowId, id);
    db.prepare(`UPDATE sessions SET flow_id = ? WHERE item_id = ?`).run(flowId, id);
  });
  tx();

  const updated = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item;
  return c.json(updated);
});

items.post('/:id/sync', async c => {
  const id = Number(c.req.param('id'));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item | undefined;
  if (!item) return c.json({ error: 'item not found' }, 404);
  const source = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(item.source_id) as Source | undefined;
  if (!source) return c.json({ error: 'source not found' }, 404);

  try {
    switch (item.type) {
      case 'github_pr': {
        const number = Number(item.key);
        if (!Number.isFinite(number)) throw new Error(`invalid PR number "${item.key}"`);
        await syncGithubItem(source, number);
        break;
      }
      case 'jira_issue':
        await upsertJiraIssue(source.id, item.key);
        break;
      case 'sentry_issue':
        await upsertSentryIssue(source.id, item.ext_id);
        break;
      case 'plan':
        return c.json({ error: 'plans have no upstream to sync' }, 400);
    }
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }

  const updated = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item;
  return c.json(updated);
});
