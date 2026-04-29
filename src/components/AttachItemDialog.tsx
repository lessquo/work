import { TYPE_LOGO } from '@/components/typeLogo';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Item, itemTitle } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Dialog } from '@base-ui/react/dialog';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function AttachItemDialog({
  open,
  onOpenChange,
  workflowId,
  sourceId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workflowId: number;
  sourceId: number;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 bg-black/30' />
        <Dialog.Popup className='fixed top-1/2 left-1/2 flex h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-white shadow-xl outline-none'>
          {open && <Body workflowId={workflowId} sourceId={sourceId} onClose={() => onOpenChange(false)} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({
  workflowId,
  sourceId,
  onClose,
}: {
  workflowId: number;
  sourceId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: allItems } = useSuspenseQuery({ queryKey: ['allItems'], queryFn: api.listAllItems });
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });

  const sourceLabel = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of sources) map.set(s.id, s.external_id);
    return map;
  }, [sources]);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const candidates = useMemo(() => allItems.filter(it => it.workflow_id !== workflowId), [allItems, workflowId]);

  const fuse = useMemo(
    () =>
      new Fuse(candidates, {
        keys: [
          { name: 'title', weight: 2, getFn: itemTitle },
          { name: 'externalId', weight: 1, getFn: it => it.external_id },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [candidates],
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return candidates;
    return fuse.search(q).map(r => r.item);
  }, [candidates, fuse, query]);

  const attachMutation = useMutation({
    mutationFn: (itemId: number) => api.setItemWorkflow(itemId, workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      toast.add({ title: 'Item attached to workflow', type: 'success' });
      onClose();
    },
    onError: e => {
      toast.add({ title: 'Failed to attach item', description: e instanceof Error ? e.message : String(e), type: 'error' });
    },
  });

  function handleConfirm() {
    if (selectedId === null) return;
    attachMutation.mutate(selectedId);
  }

  return (
    <>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <Dialog.Title className='text-base font-semibold'>Attach item to workflow</Dialog.Title>
        <button onClick={onClose} className='btn-md btn-ghost' aria-label='close'>
          <X />
        </button>
      </div>

      <div className='border-b px-4 py-3'>
        <Input
          type='search'
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='Search by title or external id…'
          className='w-full'
          autoFocus
        />
      </div>

      <ul className='flex-1 overflow-y-auto'>
        {results.length === 0 ? (
          <li className='px-4 py-8 text-center text-sm text-gray-500'>
            {candidates.length === 0 ? 'No items available.' : 'No items match your search.'}
          </li>
        ) : (
          results.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              sourceLabel={sourceLabel.get(item.source_id) ?? `Source #${item.source_id}`}
              selected={selectedId === item.id}
              onSelect={() => setSelectedId(item.id)}
            />
          ))
        )}
      </ul>

      {selectedId !== null && allItems.find(i => i.id === selectedId)?.workflow_id != null && (
        <div className='border-t bg-amber-50 px-4 py-2 text-[11px] text-amber-800'>
          This item is currently attached to another workflow. Attaching will move it (and its sessions) here.
        </div>
      )}

      <div className='flex items-center justify-end gap-2 border-t px-4 py-3'>
        <button onClick={onClose} className='btn-md btn-secondary'>
          Cancel
        </button>
        <button
          type='button'
          onClick={handleConfirm}
          disabled={selectedId === null || attachMutation.isPending}
          className='btn-md btn-primary'
        >
          {attachMutation.isPending ? 'Attaching…' : 'Attach'}
        </button>
      </div>
    </>
  );
}

function ItemRow({
  item,
  sourceLabel,
  selected,
  onSelect,
}: {
  item: Item;
  sourceLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const logo = TYPE_LOGO[item.type];
  const title = itemTitle(item);
  return (
    <li>
      <button
        type='button'
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2 border-b border-gray-100 px-4 py-2 text-left hover:bg-gray-50',
          selected && 'bg-emerald-50 hover:bg-emerald-50',
        )}
      >
        <img src={logo.src} alt={logo.alt} className='size-4 shrink-0' />
        <div className='min-w-0 flex-1'>
          <div className='truncate text-sm font-medium text-gray-800'>{title}</div>
          <div className='mt-0.5 flex items-center gap-1 text-[11px] text-gray-500'>
            <span className='truncate'>{item.external_id}</span>
            <span>·</span>
            <span className='shrink-0'>{sourceLabel}</span>
            {item.workflow_id != null && (
              <>
                <span>·</span>
                <span className='shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800'>
                  in workflow #{item.workflow_id}
                </span>
              </>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
