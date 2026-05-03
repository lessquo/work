import { parsePromptFile, promptPath, serializePromptFile } from '@server/worker/prompt.js';
import { Hono } from 'hono';
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const prompts = new Hono();

const PROMPTS_DIR = resolve(process.cwd(), 'prompts');
const ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;

prompts.get('/prompts', async c => {
  let entries: string[];
  try {
    entries = (await readdir(PROMPTS_DIR)).filter(f => f.endsWith('.md'));
  } catch {
    return c.json([]);
  }
  const items = await Promise.all(
    entries.map(async f => {
      const id = f.slice(0, -3);
      const path = resolve(PROMPTS_DIR, f);
      try {
        const raw = await readFile(path, 'utf8');
        const { meta, content } = parsePromptFile(raw);
        const s = await stat(path);
        return {
          id,
          label: meta.label || id,
          hint: meta.hint,
          applies_to: meta.applies_to,
          content,
          created_at: s.birthtime.toISOString(),
        };
      } catch {
        return null;
      }
    }),
  );
  const valid = items.filter((x): x is NonNullable<typeof x> => x !== null);
  valid.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return c.json(valid);
});

const APPLIES_TO_VALUES = ['sentry_issue', 'jira_issue', 'github_pr', 'plan'] as const;
type AppliesTo = (typeof APPLIES_TO_VALUES)[number];
function asAppliesTo(v: unknown): AppliesTo | null {
  return typeof v === 'string' && (APPLIES_TO_VALUES as readonly string[]).includes(v) ? (v as AppliesTo) : null;
}

prompts.post('/prompts', async c => {
  const body = await c.req
    .json<{ id?: unknown; label?: unknown; hint?: unknown; content?: unknown; applies_to?: unknown }>()
    .catch(() => ({}) as { id?: unknown; label?: unknown; hint?: unknown; content?: unknown; applies_to?: unknown });
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const hint = typeof body.hint === 'string' ? body.hint : '';
  const content = typeof body.content === 'string' ? body.content : '';
  const applies_to = asAppliesTo(body.applies_to);

  if (!id || !label) return c.json({ error: 'id and label are required' }, 400);
  if (!ID_REGEX.test(id)) {
    return c.json({ error: 'id must be a kebab-case slug (a-z, 0-9, hyphens; cannot start with hyphen)' }, 400);
  }

  const path = promptPath(id);
  try {
    await writeFile(path, serializePromptFile({ label, hint, applies_to }, content), { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      return c.json({ error: `prompt with id "${id}" already exists` }, 409);
    }
    throw e;
  }

  const s = await stat(path);
  return c.json({ id, label, hint, applies_to, content, created_at: s.birthtime.toISOString() }, 201);
});

prompts.delete('/prompts/:id', async c => {
  const id = c.req.param('id');
  if (!ID_REGEX.test(id)) return c.json({ error: 'invalid id' }, 400);
  try {
    await unlink(promptPath(id));
    return c.json({ ok: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'not found' }, 404);
    throw e;
  }
});

prompts.get('/prompts/:id', async c => {
  const id = c.req.param('id');
  if (!ID_REGEX.test(id)) return c.json({ error: 'invalid id' }, 400);
  try {
    const raw = await readFile(promptPath(id), 'utf8');
    const { content } = parsePromptFile(raw);
    return c.body(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'unknown prompt id' }, 404);
    throw e;
  }
});

prompts.put('/prompts/:id', async c => {
  const id = c.req.param('id');
  if (!ID_REGEX.test(id)) return c.json({ error: 'invalid id' }, 400);
  const body = await c.req.json<{ content?: unknown }>().catch(() => ({}) as { content?: unknown });
  if (typeof body.content !== 'string') {
    return c.json({ error: 'content must be a string' }, 400);
  }
  let raw: string;
  try {
    raw = await readFile(promptPath(id), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'unknown prompt id' }, 404);
    throw e;
  }
  const { meta } = parsePromptFile(raw);
  await writeFile(promptPath(id), serializePromptFile(meta, body.content));
  return c.json({ ok: true });
});
