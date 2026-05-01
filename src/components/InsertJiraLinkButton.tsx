import { TYPE_LOGO } from '@/components/typeLogo';
import { Input } from '@/components/ui/Input';
import { api, itemTitle } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Popover } from '@base-ui/react/popover';
import { useQueries, useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';

type Row = { id: number; externalId: string; title: string; url: string };

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
        out.push({ id: it.id, externalId: it.key, title: itemTitle(it), url: it.url });
      }
    }
    return out;
  }, [itemsQueries]);

  const fuse = useMemo(
    () =>
      new Fuse(rows, {
        keys: [
          { name: 'externalId', weight: 2 },
          { name: 'title', weight: 2 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [rows],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return rows;
    return fuse.search(q).map(r => r.item);
  }, [rows, fuse, query]);

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
              {jiraSources.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-500'>No Jira sources yet.</div>
              ) : results.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-400'>
                  {rows.length === 0 ? '(no open issues)' : 'No issues match your search.'}
                </div>
              ) : (
                results.map(row => (
                  <button
                    key={row.id}
                    type='button'
                    onClick={() => {
                      onInsert(row.url);
                      setOpen(false);
                    }}
                    className='flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50'
                  >
                    <span className='shrink-0 font-mono text-[11px] text-gray-500'>{row.externalId}</span>
                    <span className='truncate'>{row.title}</span>
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
