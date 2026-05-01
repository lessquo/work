import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Item, itemTitle } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Popover } from '@base-ui/react/popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

export function AttachItemButton({ flowId, sourceId }: { flowId: number; sourceId?: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: allItems = [] } = useQuery({ queryKey: ['allItems'], queryFn: api.listAllItems });

  const candidates = useMemo(() => allItems.filter(it => it.flow_id !== flowId), [allItems, flowId]);

  const fuse = useMemo(
    () =>
      new Fuse(candidates, {
        keys: [
          { name: 'key', weight: 2, getFn: it => it.key },
          { name: 'title', weight: 2, getFn: itemTitle },
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
    mutationFn: (itemId: number) => api.setItemFlow(itemId, flowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      if (sourceId !== undefined) qc.invalidateQueries({ queryKey: ['items', sourceId] });
      toast.add({ title: 'Item attached to flow', type: 'success' });
      setOpen(false);
    },
    onError: e => {
      toast.add({
        title: 'Failed to attach item',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  async function attach(item: Item) {
    if (item.flow_id != null) {
      const ok = await confirm({
        title: 'Move item to this flow?',
        description: 'This item is currently attached to another flow. Attaching will move it (and its sessions) here.',
        confirmText: 'Move',
      });
      if (!ok) return;
    }
    attachMutation.mutate(item.id);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger
        className={cn('btn-sm btn-ghost flex items-center gap-1 text-[11px]', 'data-popup-open:bg-gray-100')}
        title='Attach item'
      >
        <Plus />
        Attach item
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4}>
          <Popover.Popup className='popup flex max-h-96 w-96 flex-col overflow-hidden'>
            <div className='border-b p-2'>
              <Input
                type='search'
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder='Search by title or key…'
                className='w-full'
                autoFocus
              />
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              {results.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-400'>
                  {candidates.length === 0 ? '(no items available)' : 'No items match your search.'}
                </div>
              ) : (
                results.map(item => {
                  const logo = TYPE_LOGO[item.type];
                  return (
                    <button
                      key={item.id}
                      type='button'
                      onClick={() => attach(item)}
                      className='flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50'
                    >
                      <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
                      <span className='shrink-0 font-mono text-[11px] text-gray-500'>{item.key}</span>
                      <span className='truncate'>{itemTitle(item)}</span>
                      {item.flow_id != null && (
                        <span className='ml-auto shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800'>
                          in flow #{item.flow_id}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
