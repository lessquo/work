import { HighlightMatch } from '@/components/HighlightMatch';
import { TYPE_LOGO } from '@/components/typeLogo';
import { Input } from '@/components/ui/Input';
import { api, type Item } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFuzzySearch } from '@/lib/fuse';
import { Combobox } from '@base-ui/react/combobox';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

export function InsertJiraLinkButton({ onInsert }: { onInsert: (url: string) => void }) {
  const sourcesQuery = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const jiraSources = (sourcesQuery.data ?? []).filter(s => s.type === 'jira_issue');

  const itemsQueries = useQueries({
    queries: jiraSources.map(s => ({
      queryKey: ['items', s.id] as const,
      queryFn: () => api.listItems(s.id),
    })),
  });

  const items = useMemo(() => itemsQueries.flatMap(q => q.data ?? []), [itemsQueries]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useFuzzySearch(items, query);
  const filteredItems = useMemo(() => results.map(r => r.item), [results]);
  const matchesById = useMemo(() => new Map(results.map(r => [r.item.id, r.matches])), [results]);

  const logo = TYPE_LOGO.jira_issue;

  return (
    <Combobox.Root<Item>
      items={items}
      filteredItems={filteredItems}
      inputValue={query}
      onInputValueChange={setQuery}
      value={null}
      onValueChange={item => {
        if (item) onInsert(item.url);
      }}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Combobox.Trigger className={cn('btn-sm btn-neutral', 'data-popup-open:bg-gray-100')}>
        <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4}>
          <Combobox.Popup className='popup flex max-h-128 w-lg flex-col overflow-hidden' aria-label='Insert Jira link'>
            <div className='p-2'>
              <Combobox.Input
                placeholder='Search by title or key…'
                render={<Input type='search' className='w-full' />}
              />
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <Combobox.Empty className='px-3 py-2 text-xs text-gray-400'>
                {jiraSources.length === 0
                  ? 'No Jira sources yet.'
                  : items.length === 0
                    ? '(no open issues)'
                    : 'No issues match your search.'}
              </Combobox.Empty>
              <Combobox.List>
                {(item: Item) => {
                  const matches = matchesById.get(item.id);
                  return (
                    <Combobox.Item key={item.id} value={item} className='combobox-item'>
                      <span className='shrink-0 font-mono text-xs text-gray-500'>
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
