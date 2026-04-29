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

items.put('/:id/workflow', async c => {
  const id = Number(c.req.param('id'));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item | undefined;
  if (!item) return c.json({ error: 'item not found' }, 404);

  const body = await c.req.json<{ workflowId?: number | null }>().catch(() => ({}) as { workflowId?: number | null });
  const workflowId = body.workflowId ?? null;

  if (workflowId !== null) {
    const workflow = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(workflowId);
    if (!workflow) return c.json({ error: 'workflow not found' }, 404);
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE items SET workflow_id = ? WHERE id = ?`).run(workflowId, id);
    db.prepare(`UPDATE sessions SET workflow_id = ? WHERE item_id = ?`).run(workflowId, id);
  });
  tx();

  const updated = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item;
  return c.json(updated);
});
