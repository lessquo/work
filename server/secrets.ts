import { db } from '@server/db.js';
import { getSetting, setSetting } from '@server/settings.js';

export const SECRET_KEYS = ['SENTRY_TOKEN', 'JIRA_API_TOKEN'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const SECRET_PREFIX = 'secret:';

export function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

export function getSecret(key: SecretKey): string | null {
  return getSetting(`${SECRET_PREFIX}${key}`);
}

export function setSecret(key: SecretKey, value: string): void {
  setSetting(`${SECRET_PREFIX}${key}`, value);
  notifyChange(key);
}

export function clearSecret(key: SecretKey): void {
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(`${SECRET_PREFIX}${key}`);
  notifyChange(key);
}

export function getSecretMeta(key: SecretKey): { configured: boolean } {
  return { configured: getSecret(key) !== null };
}

const listeners = new Map<SecretKey, Set<() => void>>();

export function onSecretChange(key: SecretKey, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

function notifyChange(key: SecretKey): void {
  listeners.get(key)?.forEach(fn => fn());
}
