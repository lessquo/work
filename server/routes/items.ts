import { db, type Item } from '@server/db.js';
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
         ), '[]') AS sessions,
         (SELECT COUNT(*) FROM notes WHERE item_id = i.id) AS note_count
       FROM items i`,
    )
    .all() as Array<Item & { sessions: string; note_count: number }>;
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
