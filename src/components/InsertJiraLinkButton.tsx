import { HighlightMatch } from '@/components/HighlightMatch';
import { TYPE_LOGO } from '@/components/typeLogo';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFuzzySearch } from '@/lib/fuse';
import { Popover } from '@base-ui/react/popover';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type Row = { id: number; key: string; title: string; url: string };

export function InsertJiraLinkButton({ onInsert }: { onInsert: (url: string) => void }) {
  const sourcesQuery = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const jiraSources = (sourcesQuery.data ?? []).filter(s => s.type === 'jira_issue');

  const itemsQueries = useQueries({
    queries: jiraSources.map(s => ({
      queryKey: ['items', s.id, 'open', 'recency'] as const,
      queryFn: () => api.listItems(s.id, 'open', 'recency'),
    })),
  });

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const q of itemsQueries) {
      if (!q.data) continue;
      for (const it of q.data) {
        out.push({ id: it.id, key: it.key, title: it.title, url: it.url });
      }
    }
    return out;
  }, [itemsQueries]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useFuzzySearch(rows, query);

  const logo = TYPE_LOGO.jira_issue;

  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger className={cn('btn-sm btn-secondary', 'data-popup-open:bg-gray-100')}>
        <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
        Insert Jira link
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4}>
          <Popover.Popup className='popup flex max-h-128 w-lg flex-col overflow-hidden'>
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
              {jiraSources.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-500'>No Jira sources yet.</div>
              ) : results.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-400'>
                  {rows.length === 0 ? '(no open issues)' : 'No issues match your search.'}
                </div>
              ) : (
                results.map(({ item, matches }) => (
                  <button
                    key={item.id}
                    type='button'
                    onClick={() => {
                      onInsert(item.url);
                      setOpen(false);
                    }}
                    className='flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50'
                  >
                    <span className='shrink-0 font-mono text-[11px] text-gray-500'>
                      <HighlightMatch text={item.key} matches={matches} field='key' />
                    </span>
                    <span className='truncate'>
                      <HighlightMatch text={item.title} matches={matches} field='title' />
                    </span>
                  </button>
                ))
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
