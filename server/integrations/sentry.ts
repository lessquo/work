import { upsertItems, type Source } from '@server/db.js';
import { getSecret } from '@server/secrets.js';
import { getSentryOrg } from '@server/settings.js';

const SENTRY_API = 'https://sentry.io/api/0';
const PAGE_SIZE = 100;

function org(): string {
  const o = getSentryOrg();
  if (!o) throw new Error('Sentry org slug is not set. Configure it in Settings → Sentry.');
  return o;
}

type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string | null;
  status: string;
  firstSeen: string | null;
  lastSeen: string | null;
  permalink: string;
  count?: string | number | null;
  userCount?: number | null;
};

function token(): string {
  const t = getSecret('SENTRY_TOKEN');
  if (!t) {
    throw new Error('SENTRY_TOKEN is not set. Configure it in Settings → Sentry.');
  }
  return t;
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  // Sentry's Link header: <url>; rel="next"; results="true"; cursor="..."
  // Split by comma, but URLs can contain commas, so use a simpler approach:
  // match each <...> block with its attributes.
  const entries = header.split(/,\s*(?=<)/);
  for (const entry of entries) {
    const urlMatch = entry.match(/^<([^>]+)>/);
    if (!urlMatch) continue;
    const rel = entry.match(/rel="([^"]+)"/)?.[1];
    const results = entry.match(/results="([^"]+)"/)?.[1];
    if (rel === 'next' && results === 'true') return urlMatch[1];
  }
  return null;
}

async function fetchPage(url: string): Promise<{
  issues: SentryIssue[];
  next: string | null;
}> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry ${res.status}: ${text}`);
  }
  const issues = (await res.json()) as SentryIssue[];
  return { issues, next: parseNextLink(res.headers.get('link')) };
}

async function fetchAllSentryIssues(source: Source, limit: number): Promise<SentryIssue[]> {
  const first = `${SENTRY_API}/projects/${org()}/${source.ext_id}/issues/?query=&limit=${PAGE_SIZE}`;
  const all: SentryIssue[] = [];
  let url: string | null = first;
  while (url && all.length < limit) {
    const { issues, next } = await fetchPage(url);
    all.push(...issues);
    url = next;
  }
  return all.slice(0, limit);
}

export async function fetchSentryIssue(sentryId: string): Promise<SentryIssue> {
  const res = await fetch(`${SENTRY_API}/issues/${sentryId}/`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry GET /issues/${sentryId} ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as SentryIssue;
}

export async function upsertSentryIssue(sourceId: number, sentryId: string): Promise<SentryIssue> {
  const i = await fetchSentryIssue(sentryId);
  upsertItems('sentry_issue', sourceId, [
    {
      ext_id: i.id,
      key: i.shortId,
      title: i.title,
      status: i.status,
      url: i.permalink,
      raw: JSON.stringify(i),
    },
  ]);
  return i;
}

export async function syncSentrySource(source: Source, limit: number): Promise<number> {
  const remote = await fetchAllSentryIssues(source, limit);
  upsertItems(
    'sentry_issue',
    source.id,
    remote.map(i => ({
      ext_id: i.id,
      key: i.shortId,
      title: i.title,
      status: i.status,
      url: i.permalink,
      raw: JSON.stringify(i),
    })),
  );
  return remote.length;
}

export type SentryProject = { slug: string; name: string };

export async function fetchSentryProjects(): Promise<SentryProject[]> {
  const all: SentryProject[] = [];
  let url: string | null = `${SENTRY_API}/organizations/${org()}/projects/?per_page=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sentry ${res.status}: ${text.slice(0, 200)}`);
    }
    const batch = (await res.json()) as Array<{ slug: string; name: string }>;
    for (const p of batch) all.push({ slug: p.slug, name: p.name });
    url = parseNextLink(res.headers.get('link'));
  }
  all.sort((a, b) => a.name.localeCompare(b.name));
  return all;
}

export async function resolveSentryIssue(sentryId: string, opts?: { assignTo?: string | null }): Promise<void> {
  const body: Record<string, unknown> = { status: 'resolved' };
  if (opts?.assignTo) body.assignedTo = opts.assignTo;
  const res = await fetch(`${SENTRY_API}/issues/${sentryId}/`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry resolve ${res.status}: ${text}`);
  }
}

export async function getSentryCurrentUsername(): Promise<string | null> {
  const res = await fetch(`${SENTRY_API}/users/me/`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry whoami ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { username?: string };
  return json.username ?? null;
}

export async function commentOnSentryIssue(sentryId: string, text: string): Promise<void> {
  const res = await fetch(`${SENTRY_API}/issues/${sentryId}/comments/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const msg = (await res.text()).slice(0, 200);
    throw new Error(`Sentry comment ${res.status}: ${msg}`);
  }
}
