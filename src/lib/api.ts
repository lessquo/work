export type ItemType = 'sentry_issue' | 'jira_issue' | 'github_pr' | 'notes';

export type ItemStatus = 'open' | 'resolved';

export type Source = {
  id: number;
  type: ItemType;
  ext_id: string;
  created_at: string;
};

export type Item = {
  id: number;
  source_id: number;
  flow_id: number | null;
  type: ItemType;
  ext_id: string;
  key: string;
  title: string;
  status: string;
  url: string;
  raw: string;
  created_at: string;
  updated_at: string;
};

export type Flow = {
  id: number;
  name: string | null;
  created_at: string;
  updated_at: string;
};

export type FlowSessionChild = {
  id: number;
  item_id: number | null;
  source_id: number;
  flow_id: number | null;
  source_type: ItemType;
  status: SessionStatus;
  prompt: string;
  user_context: string | null;
  created_at: string;
  item_ext_id: string | null;
  item_key: string | null;
  item_title: string | null;
  item_type: ItemType | null;
  item_url: string | null;
  item_raw: string | null;
};

export type FlowWithChildren = Flow & {
  items: Item[];
  sessions: FlowSessionChild[];
};

export type ItemSessionSummary = { id: number; status: SessionStatus };

export type ItemWithSessions = Item & {
  sessions: ItemSessionSummary[];
  note_count?: number;
};

export type SentryRaw = {
  shortId?: string;
  title?: string;
  culprit?: string | null;
  level?: string | null;
  status?: string;
  firstSeen?: string | null;
  lastSeen?: string | null;
  count?: string | number | null;
  userCount?: number | null;
  permalink?: string;
};

export function parseSentryRaw(raw: string): SentryRaw {
  try {
    return JSON.parse(raw) as SentryRaw;
  } catch {
    return {};
  }
}

export type GithubPrRaw = {
  number?: number;
  title?: string;
  url?: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft?: boolean;
  headRefName?: string;
  author?: { login?: string } | null;
  createdAt?: string;
  updatedAt?: string;
  mergedAt?: string | null;
};

export function parseGithubPrRaw(raw: string): GithubPrRaw {
  try {
    return JSON.parse(raw) as GithubPrRaw;
  } catch {
    return {};
  }
}

export type JiraStatusCategory = 'new' | 'indeterminate' | 'done' | string;

export type JiraRaw = {
  key?: string;
  summary?: string;
  status_name?: string;
  status_category?: JiraStatusCategory;
  assignee?: string | null;
  priority?: string | null;
  issuetype?: string | null;
  created?: string;
  updated?: string;
};

export function parseJiraRaw(raw: string): JiraRaw {
  try {
    return JSON.parse(raw) as JiraRaw;
  } catch {
    return {};
  }
}

export function itemCreationTime(item: Pick<Item, 'type' | 'raw' | 'created_at'>): string {
  switch (item.type) {
    case 'sentry_issue':
      return parseSentryRaw(item.raw).firstSeen ?? item.created_at;
    case 'github_pr':
      return parseGithubPrRaw(item.raw).createdAt ?? item.created_at;
    case 'jira_issue':
      return parseJiraRaw(item.raw).created ?? item.created_at;
    case 'notes':
      return item.created_at;
  }
}

export type SessionStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted';
export type PromptId = string;
export const DEFAULT_PROMPT_ID: PromptId = 'fix-sentry-issue';
export type Prompt = {
  id: PromptId;
  label: string;
  hint: string;
  applies_to: ItemType | null;
  content: string;
  created_at: string;
};

export type Session = {
  id: number;
  item_id: number | null;
  source_id: number;
  flow_id: number | null;
  source_type: ItemType;
  user_context: string | null;
  repo: string | null;
  status: SessionStatus;
  branch: string | null;
  clone_path: string | null;
  log_path: string | null;
  error: string | null;
  prompt: string;
  claude_session_id: string | null;
  created_at: string;
};

export type SourceSession = Session & {
  item_ext_id: string | null;
  item_key: string | null;
  item_title: string | null;
  item_type: ItemType | null;
  item_url: string | null;
  item_raw: string | null;
};

export type Note = {
  id: number;
  item_id: number;
  ext_id: string;
  title: string;
  body_md: string;
  created_at: string;
  updated_at: string;
};

export type Notebook = Item & { note_count: number };

export type NotebookDetail = Item & { notes: Note[] };

export type Settings = {
  max_parallel: number;
  sync_limit: number;
  sentry_org: string;
  github_org: string;
  jira_org: string;
  jira_email: string;
};

export type SecretKey = 'SENTRY_TOKEN' | 'JIRA_API_TOKEN';
export type SecretMeta = { configured: boolean };
export type SecretsState = Record<SecretKey, SecretMeta>;

export type SentryProject = { slug: string; name: string };

export type GithubRepo = { nameWithOwner: string; name: string; description: string | null };

export type JiraProject = { key: string; name: string };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  listSources: () => req<Source[]>('/sources'),
  getSource: (id: number) => req<Source>(`/sources/${id}`),
  createSource: (s: Omit<Source, 'id' | 'created_at'>) =>
    req<Source>('/sources', { method: 'POST', body: JSON.stringify(s) }),
  deleteSource: (id: number) => req<{ ok: true }>(`/sources/${id}`, { method: 'DELETE' }),
  listItems: (sourceId: number, status: ItemStatus = 'open', sort: 'recency' | 'title' = 'recency') =>
    req<ItemWithSessions[]>(`/sources/${sourceId}/items?status=${status}&sort=${sort}`),
  getItemCounts: (sourceId: number) => req<{ open: number; resolved: number }>(`/sources/${sourceId}/counts`),
  listAllItems: () => req<Item[]>('/items'),
  getItem: (id: number) => req<Item>(`/items/${id}`),
  setItemFlow: (itemId: number, flowId: number | null) =>
    req<Item>(`/items/${itemId}/flow`, {
      method: 'PUT',
      body: JSON.stringify({ flowId }),
    }),
  syncSource: (sourceId: number) => req<{ synced: number }>(`/sources/${sourceId}/sync`, { method: 'POST' }),
  createDraftSession: (input: {
    itemId?: number;
    flowId?: number;
    sourceId?: number;
    type?: ItemType;
    prompt?: PromptId;
    repo?: string;
  }) =>
    req<Session>(`/sessions/draft`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateDraftSession: (
    sessionId: number,
    patch: {
      prompt?: PromptId;
      repo?: string;
      type?: ItemType;
      userContext?: string;
      sourceId?: number;
    },
  ) =>
    req<Session>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  queueDraftSession: (sessionId: number) => req<Session>(`/sessions/${sessionId}/queue`, { method: 'POST' }),
  resolveItems: (sourceId: number, itemIds: number[]) =>
    req<{ resolved: number; skipped: number; errors: string[] }>(`/sources/${sourceId}/resolve-items`, {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    }),
  getSession: (sessionId: number) => req<Session>(`/sessions/${sessionId}`),
  getSessionPrBody: async (sessionId: number): Promise<string> => {
    const res = await fetch(`/api/sessions/${sessionId}/pr-body`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
  updateSessionPrBody: (sessionId: number, content: string) =>
    req<{ ok: true }>(`/sessions/${sessionId}/pr-body`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  abortSession: (sessionId: number) =>
    req<{ ok: true; killed: boolean }>(`/sessions/${sessionId}/abort`, { method: 'POST' }),
  followupSession: (sessionId: number, message: string) =>
    req<Session>(`/sessions/${sessionId}/followup`, { method: 'POST', body: JSON.stringify({ message }) }),
  deleteSession: (sessionId: number) =>
    req<{ ok: true; folder_deleted: boolean }>(`/sessions/${sessionId}`, { method: 'DELETE' }),
  createGithubPr: (sessionId: number) => req<Session>(`/sessions/${sessionId}/create-github-pr`, { method: 'POST' }),
  createJiraIssue: (sessionId: number) => req<Session>(`/sessions/${sessionId}/create-jira-issue`, { method: 'POST' }),
  updateJiraIssue: (sessionId: number) => req<Session>(`/sessions/${sessionId}/update-jira-issue`, { method: 'POST' }),
  listSessions: () => req<SourceSession[]>(`/sessions`),
  listSourceSessions: (sourceId: number) => req<SourceSession[]>(`/sources/${sourceId}/sessions`),
  listFlows: () => req<FlowWithChildren[]>(`/flows`),
  createFlow: () => req<Flow>(`/flows`, { method: 'POST' }),
  deleteFlow: (id: number) => req<{ ok: true }>(`/flows/${id}`, { method: 'DELETE' }),
  autoNameFlow: (id: number) => req<{ ok: true; name: string }>(`/flows/${id}/auto-name`, { method: 'POST' }),
  getSessionDiff: async (sessionId: number): Promise<string> => {
    const res = await fetch(`/api/sessions/${sessionId}/diff`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
  getSessionCommitMessage: async (sessionId: number): Promise<string> => {
    const res = await fetch(`/api/sessions/${sessionId}/commit-message`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
  updateSessionCommitMessage: (sessionId: number, content: string) =>
    req<{ ok: true }>(`/sessions/${sessionId}/commit-message`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  getPromptTemplate: async (promptId: PromptId): Promise<string> => {
    const res = await fetch(`/api/prompts/${promptId}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
  updatePromptTemplate: (promptId: PromptId, content: string) =>
    req<{ ok: true }>(`/prompts/${promptId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  listPrompts: () => req<Prompt[]>('/prompts'),
  createPrompt: (p: { id: string; label: string; hint?: string; content?: string }) =>
    req<Prompt>('/prompts', { method: 'POST', body: JSON.stringify(p) }),
  deletePrompt: (id: string) => req<{ ok: true }>(`/prompts/${id}`, { method: 'DELETE' }),
  getSettings: () => req<Settings>('/settings'),
  updateSettings: (patch: Partial<Settings>) =>
    req<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  getSecrets: () => req<SecretsState>('/secrets'),
  setSecret: (key: SecretKey, value: string) =>
    req<{ ok: true }>(`/secrets/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  clearSecret: (key: SecretKey) => req<{ ok: true }>(`/secrets/${key}`, { method: 'DELETE' }),
  listSentryProjects: () => req<SentryProject[]>('/sentry/projects'),
  listGithubRepos: () => req<GithubRepo[]>('/github/repos'),
  listJiraProjects: () => req<JiraProject[]>('/jira/projects'),
  listNotebooks: () => req<Notebook[]>('/notes/notebooks'),
  createNotebook: (title?: string) =>
    req<Item>('/notes/notebooks', { method: 'POST', body: JSON.stringify({ title: title ?? '' }) }),
  getNotebook: (id: number) => req<NotebookDetail>(`/notes/notebooks/${id}`),
  renameNotebook: (id: number, title: string) =>
    req<Item>(`/notes/notebooks/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteNotebook: (id: number) => req<{ ok: true }>(`/notes/notebooks/${id}`, { method: 'DELETE' }),
  startNotesSession: (notebookId: number, opts: { context?: string; repo?: string } = {}) =>
    req<Session>(`/notes/notebooks/${notebookId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ context: opts.context ?? '', repo: opts.repo ?? '' }),
    }),
  getNote: (id: number) => req<Note>(`/notes/${id}`),
  updateNote: (id: number, patch: { title?: string; body_md?: string }) =>
    req<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNote: (id: number) => req<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
};
