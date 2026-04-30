import { db, type ItemType, type Workflow } from '@server/db.js';
import { generateOneShotText } from '@server/worker/name.js';
import { Hono } from 'hono';

export const workflows = new Hono();

function extractItemTitle(type: ItemType, raw: string, externalId: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (type === 'sentry_issue' && typeof parsed.title === 'string') return parsed.title;
    if (type === 'github_pr' && typeof parsed.title === 'string') return parsed.title;
    if (type === 'jira_issue' && typeof parsed.summary === 'string') return parsed.summary;
  } catch {
    /* fall through */
  }
  return externalId;
}

function sanitizeName(s: string): string {
  return (
    s
      .split('\n')
      .find(l => l.trim().length > 0)
      ?.trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?]+$/, '')
      .slice(0, 40) ?? ''
  );
}

workflows.post('/', c => {
  const res = db.prepare(`INSERT INTO workflows (name) VALUES (NULL)`).run();
  const workflow = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(res.lastInsertRowid) as Workflow;
  return c.json(workflow);
});

workflows.post('/:id/auto-name', async c => {
  const id = Number(c.req.param('id'));
  const workflow = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as Workflow | undefined;
  if (!workflow) return c.json({ error: 'not found' }, 404);

  const items = db
    .prepare(`SELECT type, raw, external_id FROM items WHERE workflow_id = ?`)
    .all(id) as Array<{ type: ItemType; raw: string; external_id: string }>;
  const sessions = db
    .prepare(`SELECT prompt, status FROM sessions WHERE workflow_id = ? ORDER BY id ASC`)
    .all(id) as Array<{ prompt: string; status: string }>;

  if (items.length === 0 && sessions.length === 0) {
    return c.json({ error: 'workflow has no items or sessions' }, 400);
  }

  const lines: string[] = [];
  lines.push('Generate a short name for the workflow described below.');
  lines.push('Constraints:');
  lines.push('- Max 40 characters.');
  lines.push('- Sentence case, plain text, no quotes, no trailing punctuation.');
  lines.push('- Capture the unifying theme across the items and sessions.');
  lines.push('- Output ONLY the name on a single line. No preamble or explanation.');
  lines.push('');
  if (items.length) {
    lines.push('Items:');
    for (const i of items) lines.push(`- [${i.type}] ${extractItemTitle(i.type, i.raw, i.external_id)}`);
  }
  if (sessions.length) {
    lines.push('Sessions:');
    for (const s of sessions) lines.push(`- (${s.status}) ${s.prompt}`);
  }

  try {
    const name = sanitizeName(await generateOneShotText(lines.join('\n')));
    if (!name) return c.json({ error: 'empty name from claude' }, 500);
    db.prepare(`UPDATE workflows SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);
    return c.json({ ok: true, name });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
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
