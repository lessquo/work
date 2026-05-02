import { ItemCard } from '@/components/items/ItemCard';
import { SyncItemsButton } from '@/components/items/SyncItemsButton';
import { PageSwitcher } from '@/components/PageSwitcher';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useFuzzySearch } from '@/lib/fuse';
import { useNumberParam } from '@/lib/router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router';

export function ItemsPage() {
  const itemId = useNumberParam('itemId');
  const navigate = useNavigate();
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedIds, setSelectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));

  function setSelection(newAnchor: number | null, newExtras: number[]) {
    const filtered = newExtras.filter(eid => eid !== newAnchor);
    if (newAnchor === itemId) {
      setSelectedIds(filtered.length === 0 ? null : filtered);
      return;
    }
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filtered.length > 0) params.set('selected', filtered.join(','));
    const path = newAnchor !== null ? `/items/${newAnchor}` : `/items`;
    navigate({ pathname: path, search: params.toString() });
  }

  const itemsQuery = useSuspenseQuery({
    queryKey: ['items', null],
    queryFn: api.listAllItems,
  });
  const allItems = itemsQuery.data;

  const results = useFuzzySearch(allItems, query);
  const items = useMemo(() => results.map(r => r.item), [results]);

  const visibleIds = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const validSelectedIds = useMemo(() => selectedIds.filter(eid => visibleIds.has(eid)), [selectedIds, visibleIds]);
  const validItemId = itemId !== null && visibleIds.has(itemId) ? itemId : null;
  const selection = useMemo(() => {
    const set = new Set<number>(validSelectedIds);
    if (validItemId !== null) set.add(validItemId);
    return set;
  }, [validSelectedIds, validItemId]);

  useEffect(() => {
    if (items.length === 0) return;
    if (validItemId !== null) return;
    const params = new URLSearchParams(window.location.search);
    navigate({ pathname: `/items/${items[0].id}`, search: params.toString() }, { replace: true });
  }, [items, validItemId, navigate]);

  const error = itemsQuery.error instanceof Error ? itemsQuery.error.message : null;

  function selectItem(clickedId: number, modifiers: { shiftKey: boolean; metaKey: boolean }) {
    const anchor = validItemId;
    if (modifiers.shiftKey && anchor !== null && anchor !== clickedId) {
      const startIdx = items.findIndex(i => i.id === anchor);
      const endIdx = items.findIndex(i => i.id === clickedId);
      if (startIdx !== -1 && endIdx !== -1) {
        const merged = new Set<number>(validSelectedIds);
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        for (let i = lo; i <= hi; i++) merged.add(items[i].id);
        setSelection(anchor, Array.from(merged));
        return;
      }
    }
    if (modifiers.metaKey) {
      if (selection.has(clickedId)) {
        if (selection.size <= 1) return;
        if (clickedId === anchor) {
          const remaining = validSelectedIds.filter(eid => eid !== clickedId);
          const newAnchor = remaining[0] ?? null;
          const newExtras = remaining.slice(1);
          setSelection(newAnchor, newExtras);
        } else {
          setSelection(
            anchor,
            validSelectedIds.filter(eid => eid !== clickedId),
          );
        }
      } else {
        if (anchor === null) {
          setSelection(clickedId, validSelectedIds);
        } else {
          setSelection(anchor, [...validSelectedIds, clickedId]);
        }
      }
      return;
    }
    setSelection(clickedId, []);
  }

  const loading = itemsQuery.isLoading;

  return (
    <>
      <title>Items · Work</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h1 className='flex items-center gap-1 text-lg font-semibold'>
              Work
              <PageSwitcher />
            </h1>
            <SyncItemsButton />
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
          ) : items.length === 0 ? (
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
                  selected={selection.has(item.id)}
                  onSelect={selectItem}
                  onOpenSession={sessionId => navigate(`/sessions/${sessionId}`)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
          <Outlet />
        </div>
      </div>
    </>
  );
}
