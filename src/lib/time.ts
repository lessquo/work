// SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` in UTC but with no timezone marker,
// which V8 parses as local time. Treat such strings as UTC.
function parseTimestamp(iso: string): number {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
}

export function timeAgo(iso: string) {
  const d = parseTimestamp(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
