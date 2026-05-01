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
  type ItemType,
  type ItemWithSessions,
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
  const [sourceId] = useQueryState('source', parseAsInteger.withDefault(0));
  const itemId = itemIdProp ?? (itemIdParam ? Number(itemIdParam) : null);
  const isFlowMode = itemIdProp !== undefined;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const [filter] = useQueryState('filter', parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'));
  const [sort] = useQueryState('sort', parseAsStringLiteral(['recency', 'title'] as const).withDefault('recency'));
  const [selectedIds, setSelectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const [, setSessionIdQs] = useQueryState('session', parseAsInteger);

  const sourceItemsQuery = useSuspenseQuery({
    queryKey: isFlowMode ? ['items-noop'] : ['items', sourceId, filter, sort],
    queryFn: (): Promise<ItemWithSessions[]> =>
      isFlowMode ? Promise.resolve([]) : api.listItems(sourceId, filter, sort),
  });
  const flowItemQuery = useSuspenseQuery({
    queryKey: isFlowMode && itemId !== null ? ['item', itemId] : ['item-noop'],
    queryFn: (): Promise<Item | null> => (isFlowMode && itemId !== null ? api.getItem(itemId) : Promise.resolve(null)),
  });

  const ids = new Set<number>(selectedIds);
  if (itemId !== null) ids.add(itemId);
  const selectedItems: Item[] = isFlowMode
    ? flowItemQuery.data
      ? [flowItemQuery.data]
      : []
    : sourceItemsQuery.data.filter(i => ids.has(i.id));
  const count = selectedItems.length;
  const sid = isFlowMode ? (selectedItems[0]?.source_id ?? sourceId) : sourceId;
  const single = count === 1 ? selectedItems[0]! : null;

  function invalidateAfterMutation() {
    setSelectedIds(null);
    qc.invalidateQueries({ queryKey: ['items', sid] });
    qc.invalidateQueries({ queryKey: ['itemCounts', sid] });
    if (isFlowMode) {
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (itemId !== null) qc.invalidateQueries({ queryKey: ['item', itemId] });
    }
  }

  const createSessionsMutation = useMutation({
    mutationFn: async (targetItems: Item[]) => {
      const results = await Promise.allSettled(targetItems.map(it => api.createDraftSession({ itemId: it.id })));
      return results;
    },
    onSuccess: results => {
      const created = results.filter(r => r.status === 'fulfilled');
      const skipped = results.length - created.length;
      const skippedNote = skipped > 0 ? ` (${skipped} skipped)` : '';
      toast.add({
        title:
          created.length === 0
            ? 'No drafts created.'
            : `Created ${created.length} draft session${created.length === 1 ? '' : 's'}${skippedNote}.`,
      });
      invalidateAfterMutation();
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (created.length === 1 && created[0].status === 'fulfilled') {
        const sess = created[0].value;
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
      }
    },
  });

  const resolveItemsMutation = useMutation({
    mutationFn: (targetIds: number[]) => api.resolveItems(sid, targetIds),
    onSuccess: res => {
      const parts: string[] = [`Resolved ${res.resolved} item${res.resolved === 1 ? '' : 's'}`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} error${res.errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      invalidateAfterMutation();
    },
  });

  const createFlowsMutation = useMutation({
    mutationFn: (targetIds: number[]) => api.createFlowsForItems(sid, targetIds),
    onSuccess: res => {
      toast.add({
        title: res.created === 0 ? 'No flows created.' : `Created ${res.created} flow${res.created === 1 ? '' : 's'}.`,
      });
      invalidateAfterMutation();
      navigate(`/flows`);
    },
  });

  const deleteSessionsMutation = useMutation({
    mutationFn: (targetIds: number[]) => api.deleteItemSessions(sid, targetIds),
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

  const creatingSessions = createSessionsMutation.isPending;
  const resolving = resolveItemsMutation.isPending;
  const deletingSessions = deleteSessionsMutation.isPending;
  const creatingFlows = createFlowsMutation.isPending;

  async function copyLinksAsMarkdown() {
    const lines = selectedItems.map(item => {
      const label =
        item.type === 'sentry_issue' ? (parseSentryRaw(item.raw).shortId ?? `#${item.id}`) : item.external_id;
      return `[${label}](${item.url})`;
    });
    const text = lines.length === 1 ? lines[0] : lines.map(l => `- ${l}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: count === 1 ? 'Copied link.' : `Copied ${count} links.` });
    } catch (e) {
      toast.add({ title: `Copy failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  function createSessions() {
    if (count === 0) return;
    createSessionsMutation.mutate(selectedItems);
  }

  async function resolveSelected() {
    if (count === 0) return;
    const ok = await confirm({
      title: `Resolve ${count} item${count === 1 ? '' : 's'}?`,
      description: 'The selected items will be marked as resolved upstream.',
      confirmText: 'Resolve',
    });
    if (!ok) return;
    resolveItemsMutation.mutate(selectedItems.map(i => i.id));
  }

  async function deleteSelectedSessions() {
    if (count === 0) return;
    const ok = await confirm({
      title: `Delete sessions for ${count} item${count === 1 ? '' : 's'}?`,
      description:
        'The latest session for each selected item will be deleted along with its clone folder. Active (queued/running) sessions will be skipped.',
      confirmText: 'Delete sessions',
      destructive: true,
    });
    if (!ok) return;
    deleteSessionsMutation.mutate(selectedItems.map(i => i.id));
  }

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            {single ? (
              <ItemHeading item={single} />
            ) : (
              <span className='font-semibold'>
                {count} item{count === 1 ? '' : 's'} selected
              </span>
            )}
            <Tooltip content={count === 1 ? 'Copy link as Markdown' : `Copy ${count} links as Markdown`}>
              <button
                onClick={copyLinksAsMarkdown}
                disabled={count === 0}
                className='btn-sm btn-ghost'
                aria-label='copy links'
              >
                <Copy />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {single && (
            <a href={single.url} target='_blank' rel='noreferrer' className='btn-sm btn-success'>
              {externalLinkLabel(single.type)}
            </a>
          )}
          {filter === 'open' && (
            <>
              <Tooltip content='Create a draft session per selected item — configure and run from the session panel'>
                <button
                  onClick={createSessions}
                  disabled={creatingSessions || count === 0}
                  className='btn-sm btn-primary'
                >
                  {creatingSessions ? 'Creating…' : count > 1 ? `Create ${count} sessions` : 'Create session'}
                </button>
              </Tooltip>
              <Tooltip content='Mark the selected issues as resolved upstream'>
                <button onClick={resolveSelected} disabled={resolving || count === 0} className='btn-sm btn-secondary'>
                  {resolving ? 'Resolving…' : 'Resolve'}
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip
            content={
              count === 1 ? 'Create a flow with this item as a child' : `Create ${count} flows, one per selected item`
            }
          >
            <button
              onClick={() => createFlowsMutation.mutate(selectedItems.map(i => i.id))}
              disabled={creatingFlows || count === 0}
              className='btn-sm btn-secondary'
            >
              <Workflow />
              {creatingFlows ? 'Creating…' : count > 1 ? `Create ${count} flows` : 'Create flow'}
            </button>
          </Tooltip>
          <Tooltip content='Delete the latest session for each selected issue (active sessions skipped)'>
            <button
              onClick={deleteSelectedSessions}
              disabled={deletingSessions || count === 0}
              className='btn-sm btn-danger'
            >
              {deletingSessions ? 'Deleting…' : 'Delete sessions'}
            </button>
          </Tooltip>
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-auto'>
        {single ? <ItemBody item={single} /> : count > 1 ? <SelectionList items={selectedItems} /> : null}
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
      <span className='min-w-0 truncate font-semibold'>{itemTitle(item)}</span>
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

function SelectionList({ items }: { items: Item[] }) {
  return (
    <ul className='flex flex-col divide-y'>
      {items.map(item => {
        const logo = TYPE_LOGO[item.type];
        return (
          <li key={item.id} className='flex items-center gap-2 px-4 py-2 text-sm'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='min-w-0 truncate text-gray-800 hover:underline'
            >
              {itemTitle(item)}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function externalLinkLabel(type: ItemType): string {
  switch (type) {
    case 'jira_issue':
      return 'View Jira issue ↗';
    case 'github_pr':
      return 'View PR ↗';
    case 'sentry_issue':
      return 'View in Sentry ↗';
    case 'notes':
      return 'Open ↗';
  }
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
      return parseSentryRaw(item.raw).shortId ?? null;
    case 'github_pr': {
      const n = parseGithubPrRaw(item.raw).number;
      return n ? `#${n}` : null;
    }
    case 'jira_issue':
      return item.external_id;
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
