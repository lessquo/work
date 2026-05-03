import { db, getLocalMarkdownSourceId, type Item } from '@server/db.js';
import { Hono } from 'hono';

export const markdown = new Hono();

function generateMarkdownExtId(): string {
  return `md-${Date.now().toString(36)}`;
}

function getMarkdown(itemId: number): Item | undefined {
  return db.prepare(`SELECT * FROM items WHERE id = ? AND type = 'markdown'`).get(itemId) as Item | undefined;
}

function rawWith(title: string, body: string): string {
  return JSON.stringify({ title, body });
}

// GET /api/markdown — list all markdown items
markdown.get('/', c => {
  const rows = db
    .prepare(`SELECT * FROM items WHERE type = 'markdown' ORDER BY updated_at DESC, id DESC`)
    .all() as Item[];
  return c.json(rows);
});

// POST /api/markdown — create an empty markdown item
markdown.post('/', async c => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
  const title = (body.title ?? '').trim() || 'Untitled markdown';
  const sourceId = getLocalMarkdownSourceId();
  const extId = generateMarkdownExtId();
  const res = db
    .prepare(
      `INSERT INTO items (source_id, type, ext_id, key, title, status, url, raw) VALUES (?, 'markdown', ?, ?, ?, 'open', '', ?)`,
    )
    .run(sourceId, extId, extId, title, rawWith(title, ''));
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(res.lastInsertRowid) as Item;
  return c.json(item, 201);
});

// GET /api/markdown/:id — fetch a single markdown item
markdown.get('/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getMarkdown(id);
  if (!item) return c.json({ error: 'markdown not found' }, 404);
  return c.json(item);
});

// PATCH /api/markdown/:id — update title and/or body. Body lives in items.raw as { title, body }.
markdown.patch('/:id', async c => {
  const id = Number(c.req.param('id'));
  const item = getMarkdown(id);
  if (!item) return c.json({ error: 'markdown not found' }, 404);

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

// DELETE /api/markdown/:id — drop the markdown item (cascades sessions).
markdown.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getMarkdown(id);
  if (!item) return c.json({ error: 'markdown not found' }, 404);
  db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
  return c.json({ ok: true });
});
