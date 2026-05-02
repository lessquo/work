import { HighlightMatch } from '@/components/HighlightMatch';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Item } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFuzzySearch } from '@/lib/fuse';
import { Combobox } from '@base-ui/react/combobox';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

export function AttachItemButton({ flowId, sourceId }: { flowId: number; sourceId?: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: allItems = [] } = useQuery({ queryKey: ['allItems'], queryFn: api.listAllItems });

  const items = useMemo(() => allItems.filter(it => it.flow_id !== flowId), [allItems, flowId]);

  const results = useFuzzySearch(items, query);
  const filteredItems = useMemo(() => results.map(r => r.item), [results]);
  const matchesById = useMemo(() => new Map(results.map(r => [r.item.id, r.matches])), [results]);

  const attachMutation = useMutation({
    mutationFn: (itemId: number) => api.setItemFlow(itemId, flowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      if (sourceId !== undefined) qc.invalidateQueries({ queryKey: ['items', sourceId] });
      toast.add({ title: 'Item attached to flow', type: 'success' });
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
    <Combobox.Root<Item>
      items={items}
      filteredItems={filteredItems}
      inputValue={query}
      onInputValueChange={setQuery}
      value={null}
      onValueChange={item => {
        if (item) attach(item);
      }}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Combobox.Trigger
        className={cn('btn-sm btn-ghost flex items-center gap-1 text-[11px]', 'data-popup-open:bg-gray-100')}
        title='Attach item'
      >
        <Plus />
        Attach item
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4}>
          <Combobox.Popup className='popup flex max-h-128 w-lg flex-col overflow-hidden' aria-label='Attach item'>
            <div className='p-2'>
              <Combobox.Input
                placeholder='Search by title or key…'
                render={<Input type='search' className='w-full' />}
              />
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <Combobox.Empty className='px-3 py-2 text-xs text-gray-400'>
                {items.length === 0 ? '(no items available)' : 'No items match your search.'}
              </Combobox.Empty>
              <Combobox.List>
                {(item: Item) => {
                  const logo = TYPE_LOGO[item.type];
                  const matches = matchesById.get(item.id);
                  return (
                    <Combobox.Item key={item.id} value={item} className='combobox-item'>
                      <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
                      <span className='shrink-0 font-mono text-[11px] text-gray-500'>
                        <HighlightMatch text={item.key} matches={matches} field='key' />
                      </span>
                      <span className='truncate'>
                        <HighlightMatch text={item.title} matches={matches} field='title' />
                      </span>
                      {item.flow_id != null && (
                        <span className='ml-auto shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800'>
                          in flow #{item.flow_id}
                        </span>
                      )}
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
