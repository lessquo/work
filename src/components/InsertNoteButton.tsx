import { HighlightMatch } from '@/components/HighlightMatch';
import { Input } from '@/components/ui/Input';
import { api, type NotebookDetail } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFuzzySearch } from '@/lib/fuse';
import { Combobox } from '@base-ui/react/combobox';
import { useQueries, useQuery } from '@tanstack/react-query';
import { NotebookPen } from 'lucide-react';
import { useMemo, useState } from 'react';

type NoteItem = { id: number; key: string; title: string; body_md: string };

export function InsertNoteButton({ onInsert }: { onInsert: (note: { title: string; body_md: string }) => void }) {
  const notebooksQuery = useQuery({ queryKey: ['notebooks'], queryFn: api.listNotebooks });
  const notebooks = notebooksQuery.data ?? [];

  const detailQueries = useQueries({
    queries: notebooks.map(nb => ({
      queryKey: ['notebook', nb.id],
      queryFn: () => api.getNotebook(nb.id),
      enabled: notebooks.length > 0,
    })),
  });

  const items = useMemo<NoteItem[]>(() => {
    const out: NoteItem[] = [];
    for (const q of detailQueries) {
      const detail: NotebookDetail | undefined = q.data;
      if (!detail) continue;
      for (const note of detail.notes) {
        out.push({ id: note.id, key: detail.title, title: note.title, body_md: note.body_md });
      }
    }
    return out;
  }, [detailQueries]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useFuzzySearch(items, query);
  const filteredItems = useMemo(() => results.map(r => r.item), [results]);
  const matchesById = useMemo(() => new Map(results.map(r => [r.item.id, r.matches])), [results]);

  return (
    <Combobox.Root<NoteItem>
      items={items}
      filteredItems={filteredItems}
      inputValue={query}
      onInputValueChange={setQuery}
      value={null}
      onValueChange={item => {
        if (item) onInsert({ title: item.title, body_md: item.body_md });
      }}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Combobox.Trigger className={cn('btn-sm btn-neutral', 'data-popup-open:bg-gray-100')}>
        <NotebookPen />
        Insert note
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4}>
          <Combobox.Popup className='popup flex max-h-128 w-lg flex-col overflow-hidden' aria-label='Insert note'>
            <div className='p-2'>
              <Combobox.Input
                placeholder='Search by notebook or title…'
                render={<Input type='search' className='w-full' />}
              />
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <Combobox.Empty className='px-3 py-2 text-xs text-gray-400'>
                {notebooks.length === 0
                  ? 'No notebooks yet.'
                  : items.length === 0
                    ? '(no notes)'
                    : 'No notes match your search.'}
              </Combobox.Empty>
              <Combobox.List>
                {(item: NoteItem) => {
                  const matches = matchesById.get(item.id);
                  return (
                    <Combobox.Item key={item.id} value={item} className='combobox-item'>
                      <span className='shrink-0 font-mono text-[11px] text-gray-500'>
                        <HighlightMatch text={item.key} matches={matches} field='key' />
                      </span>
                      <span className='truncate'>
                        <HighlightMatch text={item.title} matches={matches} field='title' />
                      </span>
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
