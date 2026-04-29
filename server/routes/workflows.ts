import { db, type Workflow } from '@server/db.js';
import { Hono } from 'hono';

export const workflows = new Hono();

workflows.post('/', c => {
  const res = db.prepare(`INSERT INTO workflows (name) VALUES (NULL)`).run();
  const workflow = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(res.lastInsertRowid) as Workflow;
  return c.json(workflow);
});

workflows.delete('/:id', c => {
  const id = Number(c.req.param('id'));
  const res = db.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
  if (res.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

workflows.get('/', c => {
  const rows = db
    .prepare(
      `SELECT
         w.id, w.name, w.created_at, w.updated_at,
         COALESCE((
           SELECT json_group_array(json_object(
             'id',          i.id,
             'source_id',   i.source_id,
             'workflow_id', i.workflow_id,
             'type',        i.type,
             'external_id', i.external_id,
             'url',         i.url,
             'raw',         i.raw,
             'created_at',  i.created_at,
             'updated_at',  i.updated_at
           ))
           FROM items i WHERE i.workflow_id = w.id
         ), '[]') AS items,
         COALESCE((
           SELECT json_group_array(json_object(
             'id',           s.id,
             'item_id',      s.item_id,
             'source_id',    s.source_id,
             'workflow_id',  s.workflow_id,
             'type',         s.type,
             'status',       s.status,
             'prompt',       s.prompt,
             'pr_url',       s.pr_url,
             'user_context', s.user_context,
             'created_at',   s.created_at,
             'finished_at',  s.finished_at,
             'item_external_id', si.external_id,
             'item_type',        si.type,
             'item_url',         si.url,
             'item_raw',         si.raw
           ))
           FROM sessions s
           LEFT JOIN items si ON si.id = s.item_id
           WHERE s.workflow_id = w.id
         ), '[]') AS sessions
       FROM workflows w
       ORDER BY w.created_at DESC, w.id DESC`,
    )
    .all() as Array<{ id: number; name: string | null; created_at: string; updated_at: string; items: string; sessions: string }>;

  return c.json(
    rows.map(r => ({
      ...r,
      items: JSON.parse(r.items),
      sessions: JSON.parse(r.sessions),
    })),
  );
});
