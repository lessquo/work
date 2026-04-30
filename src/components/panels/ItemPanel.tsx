import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, parseSentryRaw, type Item, type ItemWithSessions } from '@/lib/api';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Copy, Workflow } from 'lucide-react';
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
      <header className='h-header flex items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <span className='font-semibold'>
              {count} item{count === 1 ? '' : 's'} selected
            </span>
            <Tooltip content={count === 1 ? 'Copy link as Markdown' : `Copy ${count} links as Markdown`}>
              <button onClick={copyLinksAsMarkdown} className='btn-sm btn-ghost' aria-label='copy links'>
                <Copy />
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      <section className='border-b px-4 py-3'>
        <div className='flex gap-2'>
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
      </section>
    </aside>
  );
}
