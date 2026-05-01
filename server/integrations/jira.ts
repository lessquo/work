import { upsertItems, type Source } from '@server/db.js';
import { getSecret } from '@server/secrets.js';
import { getJiraEmail, getJiraOrg } from '@server/settings.js';

const SEARCH_PAGE_SIZE = 100;

function baseUrl(): string {
  const o = getJiraOrg();
  if (!o) throw new Error('Jira organization is not set. Configure it in Settings → Jira.');
  return `https://${o}.atlassian.net`;
}

export function canonicalJiraUrl(key: string): string {
  return `${baseUrl()}/browse/${key}`;
}

function assertConfig() {
  const email = getJiraEmail();
  const token = getSecret('JIRA_API_TOKEN');
  if (!email || !token) {
    throw new Error('Jira not configured — set Email and API token in Settings → Jira.');
  }
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  return { base: baseUrl(), authHeader };
}

type JiraSearchIssue = {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    assignee?: { displayName?: string } | null;
    priority?: { name?: string };
    issuetype?: { name?: string };
    created?: string;
    updated?: string;
  };
};

type JiraRaw = {
  id: string;
  key: string;
  summary?: string;
  status_name?: string;
  status_category?: string;
  assignee?: string | null;
  priority?: string | null;
  issuetype?: string | null;
  created?: string;
  updated?: string;
};

const SEARCH_FIELDS = ['summary', 'status', 'assignee', 'priority', 'issuetype', 'created', 'updated'];

async function searchIssues(jql: string, limit: number): Promise<JiraSearchIssue[]> {
  const { base, authHeader } = assertConfig();
  const all: JiraSearchIssue[] = [];
  let nextPageToken: string | undefined;

  while (all.length < limit) {
    const pageSize = Math.min(SEARCH_PAGE_SIZE, limit - all.length);
    const body: Record<string, unknown> = {
      jql,
      fields: SEARCH_FIELDS,
      maxResults: pageSize,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira /search/jql ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { issues?: JiraSearchIssue[]; nextPageToken?: string };
    const issues = json.issues ?? [];
    all.push(...issues);
    if (!json.nextPageToken || issues.length === 0) break;
    nextPageToken = json.nextPageToken;
  }
  return all.slice(0, limit);
}

function toRaw(issue: JiraSearchIssue): JiraRaw {
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields?.summary,
    status_name: issue.fields?.status?.name,
    status_category: issue.fields?.status?.statusCategory?.key,
    assignee: issue.fields?.assignee?.displayName ?? null,
    priority: issue.fields?.priority?.name ?? null,
    issuetype: issue.fields?.issuetype?.name ?? null,
    created: issue.fields?.created,
    updated: issue.fields?.updated,
  };
}

export type JiraProject = { key: string; name: string };

const PROJECT_PAGE_SIZE = 50;

export async function fetchJiraProjects(): Promise<JiraProject[]> {
  const { base, authHeader } = assertConfig();
  const all: JiraProject[] = [];
  let startAt = 0;
  while (true) {
    const url = `${base}/rest/api/3/project/search?startAt=${startAt}&maxResults=${PROJECT_PAGE_SIZE}&orderBy=name`;
    const res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira /project/search ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { values?: Array<{ key: string; name: string }>; isLast?: boolean };
    for (const p of json.values ?? []) all.push({ key: p.key, name: p.name });
    if (json.isLast || !json.values?.length) break;
    startAt += json.values.length;
  }
  return all;
}

type AdfNode = { type: string; [k: string]: unknown };

// Minimal Markdown → Atlassian Document Format converter. Handles paragraphs, headings,
// bullet lists, and inline code/bold. Anything fancier degrades to plain paragraph text.
function markdownToAdf(md: string): AdfNode {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const content: AdfNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: Math.min(6, heading[1].length) },
        content: inlineToAdf(heading[2]),
      });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineToAdf(text) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    content.push({ type: 'paragraph', content: inlineToAdf(para.join(' ')) });
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: md }] });
  }
  return { type: 'doc', version: 1, content };
}

function inlineToAdf(text: string): AdfNode[] {
  const out: AdfNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push({ type: 'text', text: tok.slice(1, -1), marks: [{ type: 'code' }] });
    } else if (tok.startsWith('**')) {
      out.push({ type: 'text', text: tok.slice(2, -2), marks: [{ type: 'strong' }] });
    } else if (tok.startsWith('*')) {
      out.push({ type: 'text', text: tok.slice(1, -1), marks: [{ type: 'em' }] });
    } else {
      const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        out.push({ type: 'text', text: linkMatch[1], marks: [{ type: 'link', attrs: { href: linkMatch[2] } }] });
      } else {
        out.push({ type: 'text', text: tok });
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  if (out.length === 0) out.push({ type: 'text', text });
  return out;
}

let cachedAccountId: string | null = null;

async function getJiraCurrentAccountId(): Promise<string | null> {
  if (cachedAccountId) return cachedAccountId;
  const { base, authHeader } = assertConfig();
  const res = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { accountId?: string };
  cachedAccountId = json.accountId ?? null;
  return cachedAccountId;
}

export async function createJiraIssue(
  projectKey: string,
  summary: string,
  descriptionMarkdown: string,
): Promise<{ key: string; url: string }> {
  const { base, authHeader } = assertConfig();
  const accountId = await getJiraCurrentAccountId();
  const body = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: 'Task' },
      description: markdownToAdf(descriptionMarkdown),
      ...(accountId ? { assignee: { accountId } } : {}),
    },
  };
  const res = await fetch(`${base}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira POST /issue ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { key?: string };
  if (!json.key) throw new Error('Jira create response missing key');
  return { key: json.key, url: canonicalJiraUrl(json.key) };
}

export async function updateJiraIssue(key: string, summary: string, descriptionMarkdown: string): Promise<void> {
  const { base, authHeader } = assertConfig();
  const body = {
    fields: {
      summary,
      description: markdownToAdf(descriptionMarkdown),
    },
  };
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira PUT /issue/${key} ${res.status}: ${text.slice(0, 400)}`);
  }
}

export function buildJiraIssueContext(item: { key: string; url: string }): string {
  return `[${item.key}](${item.url})`;
}

export async function fetchJiraIssue(key: string): Promise<JiraRaw> {
  const { base, authHeader } = assertConfig();
  const fields = SEARCH_FIELDS.join(',');
  const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira GET /issue/${key} ${res.status}: ${text.slice(0, 200)}`);
  }
  return toRaw((await res.json()) as JiraSearchIssue);
}

export async function upsertJiraIssue(sourceId: number, key: string): Promise<JiraRaw> {
  const raw = await fetchJiraIssue(key);
  upsertItems('jira_issue', sourceId, [
    {
      ext_id: raw.id,
      key: raw.key,
      title: raw.summary ?? raw.key,
      url: canonicalJiraUrl(raw.key),
      raw: JSON.stringify(raw),
    },
  ]);
  return raw;
}

export async function syncJiraSource(source: Source, limit: number): Promise<number> {
  const projectKey = source.ext_id.trim();
  if (!projectKey) throw new Error('Jira source ext_id is empty.');

  const jql = `project = "${projectKey}" ORDER BY updated DESC`;
  const remote = await searchIssues(jql, limit);
  upsertItems(
    'jira_issue',
    source.id,
    remote.map(issue => ({
      ext_id: issue.id,
      key: issue.key,
      title: issue.fields?.summary ?? issue.key,
      url: canonicalJiraUrl(issue.key),
      raw: JSON.stringify(toRaw(issue)),
    })),
  );
  return remote.length;
}
