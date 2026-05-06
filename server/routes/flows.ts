import { db, type Flow, type ItemType } from '@server/db.js';
import { generateOneShotText } from '@server/worker/name.js';
import { Hono } from 'hono';

export const flows = new Hono();

// The auto-name response embeds **bold** markers around tech keywords; sanitization preserves them.
function sanitizeName(s: string): string {
  return (
    s
      .split('\n')
      .find(l => l.trim().length > 0)
      ?.trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?]+$/, '') ?? ''
  );
}

flows.post('/', c => {
  const res = db.prepare(`INSERT INTO flows (name) VALUES (NULL)`).run();
  const flow = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(res.lastInsertRowid) as Flow;
  return c.json(flow);
});

flows.post('/:id/auto-name', async c => {
  const id = Number(c.req.param('id'));
  const flow = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(id) as Flow | undefined;
  if (!flow) return c.json({ error: 'not found' }, 404);

  const items = db.prepare(`SELECT type, title FROM items WHERE flow_id = ?`).all(id) as Array<{
    type: ItemType;
    title: string;
  }>;
  const sessions = db
    .prepare(`SELECT prompt, status FROM sessions WHERE flow_id = ? ORDER BY id ASC`)
    .all(id) as Array<{ prompt: string; status: string }>;

  if (items.length === 0 && sessions.length === 0) {
    return c.json({ error: 'flow has no items or sessions' }, 400);
  }

  const lines: string[] = [];
  lines.push('Generate a short name for the flow described below.');
  lines.push('Constraints:');
  lines.push(
    '- Max 40 visible characters (excluding ** markers), sentence case, plain text, no quotes, no trailing punctuation.',
  );
  lines.push(
    '- Capture the unifying theme; mention the specific technology/product/tool being changed when one applies.',
  );
  lines.push(
    '- Wrap each technology/product/tool keyword in **double-asterisk** markdown bold so the UI can highlight it. Bold ONLY concrete tools/libraries/products (e.g. **Vite 7**, **Tailwind v4**, **MUI**, **nuqs**), not language names, ecosystems, source types, or layer labels.',
  );
  lines.push('- Output ONLY the marked-up name on a single line. No preamble or explanation.');
  lines.push('');
  lines.push('Examples:');
  lines.push('- Migrate web-app to **Vite 7**');
  lines.push('- Migrate **Tailwind v3** to **v4** in builder-frontend');
  lines.push('- Migrate web-app from **MUI** to **Tailwind**');
  lines.push('- Adopt **nuqs** for URL query state');
  lines.push('');
  if (items.length) {
    lines.push('Items:');
    for (const i of items) lines.push(`- [${i.type}] ${i.title}`);
  }
  if (sessions.length) {
    lines.push('Sessions:');
    for (const s of sessions) lines.push(`- (${s.status}) ${s.prompt}`);
  }

  try {
    const name = sanitizeName(await generateOneShotText(lines.join('\n')));
    if (!name) return c.json({ error: 'empty name from claude' }, 500);
    db.prepare(`UPDATE flows SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);
    return c.json({ ok: true, name });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

flows.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  const res = db.prepare(`DELETE FROM flows WHERE id = ?`).run(id);
  if (res.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

flows.get('/', c => {
  const rows = db
    .prepare(
      `SELECT
         f.id, f.name, f.created_at, f.updated_at,
         COALESCE((
           SELECT json_group_array(json_object(
             'id',          i.id,
             'source_id',   i.source_id,
             'flow_id',     i.flow_id,
             'type',        i.type,
             'ext_id',      i.ext_id,
             'key',          i.key,
             'title',       i.title,
             'status',      i.status,
             'url',         i.url,
             'raw',         i.raw,
             'created_at',  i.created_at,
             'updated_at',  i.updated_at
           ))
           FROM items i WHERE i.flow_id = f.id
         ), '[]') AS items,
         COALESCE((
           SELECT json_group_array(json_object(
             'id',           s.id,
             'item_id',      s.item_id,
             'source_id',    s.source_id,
             'flow_id',      s.flow_id,
             'source_type',  sr.type,
             'status',       s.status,
             'prompt',       s.prompt,
             'user_context', s.user_context,
             'created_at',   s.created_at,
             'item_ext_id', si.ext_id,
             'item_key',    si.key,
             'item_title',  si.title,
             'item_type',        si.type,
             'item_url',         si.url,
             'item_raw',         si.raw
           ))
           FROM sessions s
           JOIN sources sr ON sr.id = s.source_id
           LEFT JOIN items si ON si.id = s.item_id
           WHERE s.flow_id = f.id
         ), '[]') AS sessions
       FROM flows f
       ORDER BY f.created_at DESC, f.id DESC`,
    )
    .all() as Array<{
    id: number;
    name: string | null;
    created_at: string;
    updated_at: string;
    items: string;
    sessions: string;
  }>;

  return c.json(
    rows.map(r => ({
      ...r,
      items: JSON.parse(r.items),
      sessions: JSON.parse(r.sessions),
    })),
  );
});
