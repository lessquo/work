import { ItemCard } from '@/components/items/ItemCard';
import { SyncItemsButton } from '@/components/items/SyncItemsButton';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useFuzzySearch } from '@/lib/fuse';
import { usePanel } from '@/lib/panel';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';

export function ItemsPage() {
  const [panel, setPanel] = usePanel();
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));

  const itemsQuery = useSuspenseQuery({
    queryKey: ['items', null],
    queryFn: api.listAllItems,
  });
  const allItems = itemsQuery.data;

  const results = useFuzzySearch(allItems, query);
  const error = itemsQuery.error instanceof Error ? itemsQuery.error.message : null;
  const loading = itemsQuery.isLoading;
  const openItemId = panel?.kind === 'item' ? panel.id : null;

  return (
    <>
      <title>Work Items</title>

      <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
        <div className='sticky top-0 z-10 mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <PageHeader />
          </div>
          <div className='stuck-on-scroll rounded-full'>
            <SyncItemsButton />
          </div>
        </div>

        <div className='mb-3'>
          <label className='flex w-full max-w-xs items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20'>
            <Search className='text-gray-400' />
            <Input
              variant='unstyled'
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Search by title or key…'
              className='flex-1 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none'
            />
          </label>
        </div>

        {error && (
          <div className='mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
        )}

        {loading ? (
          <p className='text-gray-500'>Loading…</p>
        ) : results.length === 0 ? (
          <p className='text-gray-500'>
            {query.trim().length > 0 ? (
              <>No items match your search.</>
            ) : (
              <>
                No items yet. Click <b>Sync</b> to fetch from a source.
              </>
            )}
          </p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {results.map(({ item, matches }) => (
              <ItemCard
                key={item.id}
                item={item}
                matches={matches}
                selected={openItemId === item.id}
                onSelect={id => setPanel({ kind: 'item', id })}
                onOpenSession={sessionId => setPanel({ kind: 'session', id: sessionId })}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
