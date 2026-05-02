import { BatchPanel } from '@/components/items/BatchPanel';
import { ItemPanel } from '@/components/items/ItemPanel';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Item } from '@/lib/api';
import { useNumberParam } from '@/lib/router';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate } from 'react-router';

export function ItemsPageSlot() {
  const itemId = useNumberParam('itemId');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [sourceId] = useQueryState('source', parseAsInteger.withDefault(0));
  const [filter] = useQueryState('filter', parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'));
  const [sort] = useQueryState('sort', parseAsStringLiteral(['recency', 'title'] as const).withDefault('recency'));
  const [selectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const sourceQuery = useSuspenseQuery({ queryKey: ['source', sourceId], queryFn: () => api.getSource(sourceId) });
  const source = sourceQuery.data;

  const itemsQuery = useSuspenseQuery({
    queryKey: ['items', sourceId, filter, sort],
    queryFn: () => api.listItems(sourceId, filter, sort),
  });
  const items = itemsQuery.data;

  const selection = new Set<number>(selectedIds);
  if (itemId !== null) selection.add(itemId);

  function clearSelection() {
    const params = new URLSearchParams(window.location.search);
    params.delete('selected');
    navigate({ pathname: `/items`, search: params.toString() });
  }

  const onMutationError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

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
      clearSelection();
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (created.length === 1 && created[0].status === 'fulfilled') {
        const sess = created[0].value;
        navigate(`/sessions/${sess.id}?sessionTab=setup`);
      }
    },
    onError: onMutationError,
  });

  const resolveItemsMutation = useMutation({
    mutationFn: (ids: number[]) => api.resolveItems(sourceId, ids),
    onSuccess: res => {
      const parts: string[] = [`Resolved ${res.resolved} item${res.resolved === 1 ? '' : 's'}`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} error${res.errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      clearSelection();
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
    },
    onError: onMutationError,
  });

  const creatingSessions = createSessionsMutation.isPending;
  const resolving = resolveItemsMutation.isPending;

  function createSelected() {
    if (selection.size === 0) return;
    const targets = items.filter(i => selection.has(i.id));
    createSessionsMutation.mutate(targets);
  }

  async function resolveSelected() {
    if (selection.size === 0) return;
    const ok = await confirm({
      title: `Resolve ${selection.size} item${selection.size === 1 ? '' : 's'}?`,
      description: 'The selected items will be marked as resolved upstream.',
      confirmText: 'Resolve',
    });
    if (!ok) return;
    resolveItemsMutation.mutate(Array.from(selection));
  }

  if (selection.size > 1) {
    return (
      <BatchPanel
        filter={filter}
        selectedItems={items.filter(i => selection.has(i.id))}
        onCreateSessions={createSelected}
        onResolve={resolveSelected}
        creatingSessions={creatingSessions}
        resolving={resolving}
      />
    );
  }

  if (selection.size === 1) {
    const [onlyId] = selection;
    return <ItemPanel itemId={onlyId} />;
  }

  return (
    <div className='flex h-full flex-1 items-center justify-center bg-gray-50 text-sm text-gray-500'>
      <p>
        {source.type === 'notes' ? (
          <>
            No notebooks yet. Click <b>New notebook</b> to create one.
          </>
        ) : (
          <>
            No items yet. Click <b>Sync</b> to fetch.
          </>
        )}
      </p>
    </div>
  );
}
