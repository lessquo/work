import { db, getLocalPlanSourceId, type Item } from '@server/db.js';
import { Hono } from 'hono';

export const plan = new Hono();

function generatePlanExtId(): string {
  return `plan-${Date.now().toString(36)}`;
}

function getPlan(itemId: number): Item | undefined {
  return db.prepare(`SELECT * FROM items WHERE id = ? AND type = 'plan'`).get(itemId) as Item | undefined;
}

function rawWith(title: string, body: string): string {
  return JSON.stringify({ title, body });
}

// GET /api/plan — list all plan items
plan.get('/', c => {
  const rows = db.prepare(`SELECT * FROM items WHERE type = 'plan' ORDER BY updated_at DESC, id DESC`).all() as Item[];
  return c.json(rows);
});

// POST /api/plan — create an empty plan
plan.post('/', async c => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
  const title = (body.title ?? '').trim() || 'Untitled plan';
  const sourceId = getLocalPlanSourceId();
  const extId = generatePlanExtId();
  const res = db
    .prepare(
      `INSERT INTO items (source_id, type, ext_id, key, title, status, url, raw) VALUES (?, 'plan', ?, ?, ?, 'open', '', ?)`,
    )
    .run(sourceId, extId, extId, title, rawWith(title, ''));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(res.lastInsertRowid) as Item;
  return c.json(item, 201);
});

// GET /api/plan/:id — fetch a single plan
plan.get('/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getPlan(id);
  if (!item) return c.json({ error: 'plan not found' }, 404);
  return c.json(item);
});

// PATCH /api/plan/:id — update title and/or body. Body lives in items.raw as { title, body }.
plan.patch('/:id', async c => {
  const id = Number(c.req.param('id'));
  const item = getPlan(id);
  if (!item) return c.json({ error: 'plan not found' }, 404);

  const patch = await c.req.json<{ title?: string; body?: string }>().catch(() => ({}) as Record<string, string>);

  let parsed: { title?: unknown; body?: unknown } = {};
  try {
    const v = JSON.parse(item.raw);
    if (v && typeof v === 'object') parsed = v as { title?: unknown; body?: unknown };
  } catch {
    /* corrupt raw — fall back to empty */
  }
  const currentTitle = typeof parsed.title === 'string' ? parsed.title : item.title;
  const currentBody = typeof parsed.body === 'string' ? parsed.body : '';

  const nextTitle = typeof patch.title === 'string' ? patch.title.trim() : currentTitle;
  const nextBody = typeof patch.body === 'string' ? patch.body : currentBody;
  if (!nextTitle) return c.json({ error: 'title cannot be empty' }, 400);

  db.prepare(`UPDATE items SET title = ?, raw = ?, updated_at = datetime('now') WHERE id = ?`).run(
    nextTitle,
    rawWith(nextTitle, nextBody),
    id,
  );
  const updated = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item;
  return c.json(updated);
});

// DELETE /api/plan/:id — drop the plan (cascades sessions).
plan.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getPlan(id);
  if (!item) return c.json({ error: 'plan not found' }, 404);
  db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
  return c.json({ ok: true });
});
