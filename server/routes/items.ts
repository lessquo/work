import { db, type Item } from '@server/db.js';
import { Hono } from 'hono';

export const items = new Hono();

items.get('/', c => {
  const rows = db.prepare(`SELECT * FROM items ORDER BY updated_at DESC, id DESC`).all() as Item[];
  return c.json(rows);
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
