import { db } from '@server/db.js';

export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getMaxParallel(): number {
  const raw = getSetting('max_parallel');
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n > 0 ? Math.min(8, Math.max(1, Math.floor(n))) : 2;
}

export const SYNC_LIMIT_DEFAULT = 1000;
export const SYNC_LIMIT_MIN = 1;
export const SYNC_LIMIT_MAX = 10000;

export function getSyncLimit(): number {
  const raw = getSetting('sync_limit');
  const n = raw ? Number(raw) : SYNC_LIMIT_DEFAULT;
  if (!Number.isFinite(n) || n <= 0) return SYNC_LIMIT_DEFAULT;
  return Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, Math.floor(n)));
}

export function getSentryOrg(): string {
  return (getSetting('sentry_org') ?? '').trim();
}

export function getGithubOrg(): string {
  return (getSetting('github_org') ?? '').trim();
}

export function getJiraOrg(): string {
  return (getSetting('jira_org') ?? '').trim();
}

export function getJiraEmail(): string {
  return (getSetting('jira_email') ?? '').trim();
}
