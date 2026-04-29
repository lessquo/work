import { SECRET_KEYS, clearSecret, getSecretMeta, isSecretKey, setSecret } from '@server/secrets.js';
import { Hono } from 'hono';

export const secrets = new Hono();

secrets.get('/', c => {
  const out = Object.fromEntries(SECRET_KEYS.map(k => [k, getSecretMeta(k)]));
  return c.json(out);
});

secrets.put('/:key', async c => {
  const key = c.req.param('key');
  if (!isSecretKey(key)) return c.json({ error: 'unknown secret key' }, 400);
  const body = await c.req.json<{ value?: string }>();
  const value = body.value?.trim();
  if (!value) return c.json({ error: 'value required' }, 400);
  setSecret(key, value);
  return c.json({ ok: true });
});

secrets.delete('/:key', c => {
  const key = c.req.param('key');
  if (!isSecretKey(key)) return c.json({ error: 'unknown secret key' }, 400);
  clearSecret(key);
  return c.json({ ok: true });
});
