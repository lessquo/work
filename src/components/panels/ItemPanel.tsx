import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  api,
  itemTitle,
  parseGithubPrRaw,
  parseJiraRaw,
  parseNotebookRaw,
  parseSentryRaw,
  type GithubPrRaw,
  type Item,
  type JiraStatusCategory,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Copy, GitBranch, Workflow } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate, useParams } from 'react-router';

export function ItemPanel({ itemId: itemIdProp }: { itemId?: number } = {}) {
  const { itemId: itemIdParam } = useParams();
  const [selectedIds, setSelectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const itemId = itemIdProp ?? (itemIdParam ? Number(itemIdParam) : (selectedIds[0] ?? null));
  const isFlowMode = itemIdProp !== undefined;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const [filter] = useQueryState('filter', parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'));
  const [, setSessionIdQs] = useQueryState('session', parseAsInteger);

  const itemQuery = useSuspenseQuery({
    queryKey: itemId !== null ? ['item', itemId] : ['item-noop'],
    queryFn: (): Promise<Item | null> => (itemId !== null ? api.getItem(itemId) : Promise.resolve(null)),
  });
  const item = itemQuery.data;

  function invalidateAfterMutation() {
    setSelectedIds(null);
    if (item) {
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['itemCounts', item.source_id] });
    }
    if (isFlowMode) {
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (item) qc.invalidateQueries({ queryKey: ['item', item.id] });
    }
  }

  const createSessionMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('no item');
      return api.createDraftSession({ itemId: item.id });
    },
    onSuccess: sess => {
      toast.add({ title: 'Created draft session.' });
      invalidateAfterMutation();
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (isFlowMode) {
        const params = new URLSearchParams(window.location.search);
        params.set('session', String(sess.id));
        params.delete('item');
        params.set('sessionTab', 'setup');
        navigate({
          pathname: sess.flow_id ? `/flows/${sess.flow_id}` : window.location.pathname,
          search: params.toString(),
        });
      } else {
        setSessionIdQs(sess.id);
      }
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('no item');
      return api.resolveItems(item.source_id, [item.id]);
    },
    onSuccess: res => {
      const parts: string[] = [`Resolved ${res.resolved} item${res.resolved === 1 ? '' : 's'}`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} error${res.errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      invalidateAfterMutation();
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('no item');
      return api.createFlowsForItems(item.source_id, [item.id]);
    },
    onSuccess: res => {
      toast.add({
        title: res.created === 0 ? 'No flows created.' : `Created ${res.created} flow${res.created === 1 ? '' : 's'}.`,
      });
      invalidateAfterMutation();
      navigate(`/flows`);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('no item');
      return api.deleteItemSessions(item.source_id, [item.id]);
    },
    onSuccess: res => {
      const parts: string[] = [`Deleted ${res.deleted} session${res.deleted === 1 ? '' : 's'}`];
      if (res.skipped_active > 0) parts.push(`${res.skipped_active} skipped (active)`);
      if (res.no_run > 0) parts.push(`${res.no_run} had no session`);
      if (res.folder_errors.length > 0)
        parts.push(`${res.folder_errors.length} folder error${res.folder_errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      invalidateAfterMutation();
    },
  });

  async function copyLink() {
    if (!item) return;
    const text = `[${item.key}](${item.url})`;
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: 'Copied link.' });
    } catch (e) {
      toast.add({ title: `Copy failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function handleResolve() {
    const ok = await confirm({
      title: 'Resolve this item?',
      description: 'This item will be marked as resolved upstream.',
      confirmText: 'Resolve',
    });
    if (!ok) return;
    resolveMutation.mutate();
  }

  async function handleDeleteSession() {
    const ok = await confirm({
      title: 'Delete sessions for this item?',
      description:
        'The latest session for this item will be deleted along with its clone folder. Active (queued/running) sessions will be skipped.',
      confirmText: 'Delete sessions',
      destructive: true,
    });
    if (!ok) return;
    deleteSessionMutation.mutate();
  }

  if (!item) return null;

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <ItemHeading item={item} />
            <Tooltip content='Copy link as Markdown'>
              <button onClick={copyLink} className='btn-sm btn-ghost' aria-label='copy link'>
                <Copy />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {filter === 'open' && (
            <>
              <Tooltip content='Create a draft session — configure and run from the session panel'>
                <button
                  onClick={() => createSessionMutation.mutate()}
                  disabled={createSessionMutation.isPending}
                  className='btn-sm btn-primary'
                >
                  {createSessionMutation.isPending ? 'Creating…' : 'Create session'}
                </button>
              </Tooltip>
              <Tooltip content='Mark this issue as resolved upstream'>
                <button onClick={handleResolve} disabled={resolveMutation.isPending} className='btn-sm btn-secondary'>
                  {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip content='Create a flow with this item as a child'>
            <button
              onClick={() => createFlowMutation.mutate()}
              disabled={createFlowMutation.isPending}
              className='btn-sm btn-secondary'
            >
              <Workflow />
              {createFlowMutation.isPending ? 'Creating…' : 'Create flow'}
            </button>
          </Tooltip>
          <Tooltip content='Delete the latest session for this issue (active sessions skipped)'>
            <button
              onClick={handleDeleteSession}
              disabled={deleteSessionMutation.isPending}
              className='btn-sm btn-danger'
            >
              {deleteSessionMutation.isPending ? 'Deleting…' : 'Delete sessions'}
            </button>
          </Tooltip>
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-auto'>
        <ItemBody item={item} />
      </div>
    </aside>
  );
}

function ItemHeading({ item }: { item: Item }) {
  const logo = TYPE_LOGO[item.type];
  const badge = getBadge(item);
  const externalId = headerExternalId(item);
  return (
    <>
      <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
      {badge && (
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
            badge.color,
          )}
        >
          {badge.label}
        </span>
      )}
      <a href={item.url} target='_blank' rel='noreferrer' className='min-w-0 truncate font-semibold hover:underline'>
        {itemTitle(item)}
      </a>
      {externalId && <span className='shrink-0 text-xs text-gray-400'>{externalId}</span>}
    </>
  );
}

function ItemBody({ item }: { item: Item }) {
  switch (item.type) {
    case 'jira_issue':
      return <JiraBody item={item} />;
    case 'github_pr':
      return <GithubPrBody item={item} />;
    case 'sentry_issue':
      return <SentryBody item={item} />;
    case 'notes':
      return <NotesBody item={item} />;
  }
}

function JiraBody({ item }: { item: Item }) {
  const j = parseJiraRaw(item.raw);
  return (
    <FieldList>
      <Field label='Type'>{j.issuetype ?? '—'}</Field>
      <Field label='Assignee'>{j.assignee ?? '—'}</Field>
      <Field label='Priority'>{j.priority ?? '—'}</Field>
      <Field label='Created'>{j.created ? timeAgo(j.created) : '—'}</Field>
      <Field label='Updated'>{j.updated ? timeAgo(j.updated) : '—'}</Field>
    </FieldList>
  );
}

function GithubPrBody({ item }: { item: Item }) {
  const pr = parseGithubPrRaw(item.raw);
  return (
    <FieldList>
      <Field label='Branch'>
        {pr.headRefName ? (
          <span className='inline-flex items-center gap-1 font-mono text-xs'>
            <GitBranch className='size-3.5' />
            {pr.headRefName}
          </span>
        ) : (
          '—'
        )}
      </Field>
      <Field label='Author'>{pr.author?.login ? `@${pr.author.login}` : '—'}</Field>
      <Field label='Created'>{pr.createdAt ? timeAgo(pr.createdAt) : '—'}</Field>
      <Field label='Updated'>{pr.updatedAt ? timeAgo(pr.updatedAt) : '—'}</Field>
      {pr.mergedAt && <Field label='Merged'>{timeAgo(pr.mergedAt)}</Field>}
    </FieldList>
  );
}

function SentryBody({ item }: { item: Item }) {
  const s = parseSentryRaw(item.raw);
  const events = toInt(s.count);
  const users = toInt(s.userCount);
  return (
    <FieldList>
      {s.culprit && (
        <Field label='Culprit'>
          <code className='text-xs break-all'>{s.culprit}</code>
        </Field>
      )}
      <Field label='Events'>{events !== null ? formatCount(events) : '—'}</Field>
      <Field label='Users'>{users !== null ? formatCount(users) : '—'}</Field>
      <Field label='First seen'>{s.firstSeen ? timeAgo(s.firstSeen) : '—'}</Field>
      <Field label='Last seen'>{s.lastSeen ? timeAgo(s.lastSeen) : '—'}</Field>
    </FieldList>
  );
}

function NotesBody({ item }: { item: Item }) {
  const n = parseNotebookRaw(item.raw);
  return (
    <FieldList>
      <Field label='Name'>{n.name ?? '—'}</Field>
      <Field label='Created'>{timeAgo(item.created_at)}</Field>
      <Field label='Updated'>{timeAgo(item.updated_at)}</Field>
    </FieldList>
  );
}

function FieldList({ children }: { children: React.ReactNode }) {
  return <dl className='flex flex-col gap-2 p-4'>{children}</dl>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-3'>
      <dt className='w-24 shrink-0 text-xs text-gray-500'>{label}</dt>
      <dd className='min-w-0 flex-1 text-sm text-gray-800'>{children}</dd>
    </div>
  );
}

function getBadge(item: Item): { label: string; color: string } | null {
  switch (item.type) {
    case 'jira_issue': {
      const j = parseJiraRaw(item.raw);
      return {
        label: j.status_name ?? 'unknown',
        color: JIRA_STATUS_COLOR[j.status_category ?? ''] ?? 'bg-gray-100 text-gray-600',
      };
    }
    case 'github_pr': {
      const pr = parseGithubPrRaw(item.raw);
      const status = prStatus(pr);
      return { label: status, color: PR_STATUS_COLOR[status] };
    }
    case 'sentry_issue': {
      const s = parseSentryRaw(item.raw);
      return {
        label: s.level ?? 'issue',
        color: SENTRY_LEVEL_COLOR[s.level ?? ''] ?? 'bg-gray-100 text-gray-600',
      };
    }
    case 'notes':
      return null;
  }
}

function headerExternalId(item: Item): string | null {
  switch (item.type) {
    case 'sentry_issue':
    case 'jira_issue':
      return item.key;
    case 'github_pr':
      return `#${item.key}`;
    case 'notes':
      return null;
  }
}

type PrStatus = 'draft' | 'open' | 'merged' | 'closed';
function prStatus(pr: GithubPrRaw): PrStatus {
  if (pr.state === 'MERGED') return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  if (pr.isDraft) return 'draft';
  return 'open';
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
}

const JIRA_STATUS_COLOR: Record<JiraStatusCategory, string> = {
  new: 'bg-gray-100 text-gray-700',
  indeterminate: 'bg-sky-100 text-sky-700',
  done: 'bg-emerald-100 text-emerald-700',
};

const PR_STATUS_COLOR: Record<PrStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-emerald-100 text-emerald-700',
  merged: 'bg-violet-100 text-violet-700',
  closed: 'bg-rose-100 text-rose-700',
};

const SENTRY_LEVEL_COLOR: Record<string, string> = {
  fatal: 'bg-rose-100 text-rose-700',
  error: 'bg-orange-100 text-orange-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  debug: 'bg-gray-100 text-gray-600',
};
