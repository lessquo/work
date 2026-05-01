import {
  createFlowForSession,
  db,
  getLocalNotesSourceId,
  listNotes,
  sessionColumns,
  sessionFrom,
  type Item,
  type Note,
  type Session,
} from '@server/db.js';
import { isPromptId } from '@server/worker/prompt.js';
import { enqueueSession } from '@server/worker/runner.js';
import { Hono } from 'hono';

export const notes = new Hono();

const NOTES_PROMPT_ID = 'write-notes';

function readNotebookName(item: Item): string {
  try {
    const obj = JSON.parse(item.raw) as { name?: unknown };
    return typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Untitled notebook';
  } catch {
    return 'Untitled notebook';
  }
}

function generateNotebookExternalId(): string {
  return `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNotebook(itemId: number): Item | undefined {
  return db.prepare(`SELECT * FROM items WHERE id = ? AND type = 'notes'`).get(itemId) as Item | undefined;
}

// GET /api/notes/notebooks — list all notebooks with their note counts
notes.get('/notebooks', c => {
  const rows = db
    .prepare(
      `SELECT i.*,
              (SELECT COUNT(*) FROM notes WHERE item_id = i.id) AS note_count
         FROM items i
        WHERE i.type = 'notes'
        ORDER BY i.updated_at DESC, i.id DESC`,
    )
    .all() as Array<Item & { note_count: number }>;
  return c.json(rows);
});

// POST /api/notes/notebooks — create an empty notebook
notes.post('/notebooks', async c => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = (body.name ?? '').trim() || 'Untitled notebook';
  const sourceId = getLocalNotesSourceId();
  const externalId = generateNotebookExternalId();
  const raw = JSON.stringify({ name });
  const res = db
    .prepare(`INSERT INTO items (source_id, type, ext_id, key, url, raw) VALUES (?, 'notes', ?, ?, '', ?)`)
    .run(sourceId, externalId, externalId, raw);
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(res.lastInsertRowid) as Item;
  return c.json(item, 201);
});

// GET /api/notes/notebooks/:id — notebook + its notes
notes.get('/notebooks/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getNotebook(id);
  if (!item) return c.json({ error: 'notebook not found' }, 404);
  return c.json({ ...item, name: readNotebookName(item), notes: listNotes(id) });
});

// PATCH /api/notes/notebooks/:id — rename
notes.patch('/notebooks/:id', async c => {
  const id = Number(c.req.param('id'));
  const item = getNotebook(id);
  if (!item) return c.json({ error: 'notebook not found' }, 404);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'name is required' }, 400);
  const raw = JSON.stringify({ name });
  db.prepare(`UPDATE items SET raw = ?, updated_at = datetime('now') WHERE id = ?`).run(raw, id);
  const updated = db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as Item;
  return c.json(updated);
});

// DELETE /api/notes/notebooks/:id — drop notebook + cascade notes/sessions.
// Session clone folders are not GC'd here (matches existing item-delete behavior elsewhere).
notes.delete('/notebooks/:id', c => {
  const id = Number(c.req.param('id'));
  const item = getNotebook(id);
  if (!item) return c.json({ error: 'notebook not found' }, 404);
  db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

// POST /api/notes/notebooks/:id/sessions — start a write-notes session on this notebook
notes.post('/notebooks/:id/sessions', async c => {
  const id = Number(c.req.param('id'));
  const item = getNotebook(id);
  if (!item) return c.json({ error: 'notebook not found' }, 404);

  const active = db
    .prepare(`SELECT 1 FROM sessions WHERE item_id = ? AND status IN ('queued','running') LIMIT 1`)
    .get(id);
  if (active) return c.json({ error: 'notebook already has an active session' }, 409);

  const body = await c.req
    .json<{ context?: string; prompt?: string; repo?: string }>()
    .catch(() => ({}) as { context?: string; prompt?: string; repo?: string });
  const userContext = (body.context ?? '').trim();
  const prompt = body.prompt && isPromptId(body.prompt) ? body.prompt : NOTES_PROMPT_ID;
  const repo = (body.repo ?? '').trim() || null;

  const res = db
    .prepare(
      `INSERT INTO sessions (item_id, source_id, user_context, repo, status, prompt)
       VALUES (?, ?, ?, ?, 'queued', ?)`,
    )
    .run(id, item.source_id, userContext || null, repo, prompt);
  const sessionId = Number(res.lastInsertRowid);
  createFlowForSession(sessionId, id);
  enqueueSession(sessionId);
  const session = db.prepare(`SELECT ${sessionColumns} FROM ${sessionFrom} WHERE s.id = ?`).get(sessionId) as Session;
  return c.json(session, 201);
});

// PATCH /api/notes/:id — edit a single note's title/body. Notes are persisted in the DB;
// the next session will materialize them into its workspace, so no in-place file mirroring.
notes.patch('/:id', async c => {
  const id = Number(c.req.param('id'));
  const note = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note | undefined;
  if (!note) return c.json({ error: 'note not found' }, 404);

  const body = await c.req.json<{ title?: string; body_md?: string }>().catch(() => ({}) as Record<string, string>);
  const nextTitle = typeof body.title === 'string' ? body.title.trim() : note.title;
  const nextBody = typeof body.body_md === 'string' ? body.body_md : note.body_md;
  if (!nextTitle) return c.json({ error: 'title cannot be empty' }, 400);

  db.prepare(`UPDATE notes SET title = ?, body_md = ?, updated_at = datetime('now') WHERE id = ?`).run(
    nextTitle,
    nextBody,
    id,
  );

  const updated = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note;
  return c.json(updated);
});

// DELETE /api/notes/:id — drop a single note from the DB
notes.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  const note = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note | undefined;
  if (!note) return c.json({ error: 'note not found' }, 404);
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

// GET /api/notes/:id — fetch a single note
notes.get('/:id', c => {
  const id = Number(c.req.param('id'));
  const note = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note | undefined;
  if (!note) return c.json({ error: 'note not found' }, 404);
  return c.json(note);
});
