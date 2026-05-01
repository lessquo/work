import { ItemCard } from '@/components/ItemCard';
import { SourceSwitcher } from '@/components/SourceSwitcher';
import { SyncItemsButton } from '@/components/items/SyncItemsButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { api, type ItemStatus, type ItemType } from '@/lib/api';
import { useFuzzySearch } from '@/lib/fuse';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

type Filter = ItemStatus;
type Sort = 'recency' | 'title';

type FilterTab = { value: Filter; label: string; recencyLabel: string };

const FILTER_TABS: Record<ItemType, FilterTab[]> = {
  sentry_issue: [
    { value: 'open', label: 'Open', recencyLabel: 'Last seen' },
    { value: 'resolved', label: 'Resolved', recencyLabel: 'Last seen' },
  ],
  github_pr: [
    { value: 'open', label: 'Open', recencyLabel: 'Updated' },
    { value: 'resolved', label: 'Closed', recencyLabel: 'Closed' },
  ],
  jira_issue: [
    { value: 'open', label: 'Open', recencyLabel: 'Updated' },
    { value: 'resolved', label: 'Done', recencyLabel: 'Done' },
  ],
  notes: [{ value: 'open', label: 'Notebooks', recencyLabel: 'Updated' }],
};

const EMPTY_OPEN_SYNC: Record<ItemType, string> = {
  sentry_issue: 'fetch from Sentry',
  github_pr: 'fetch from GitHub',
  jira_issue: 'fetch from Jira',
  notes: 'create your first notebook',
};

export function ItemsPage() {
  const [source] = useQueryState('source', parseAsInteger);

  return (
    <>
      <title>Items · Work</title>

      {source !== null ? (
        <ItemsContent sourceId={source} />
      ) : (
        <div className='flex flex-1 flex-col items-center justify-center gap-3 text-sm text-gray-500'>
          <SourceSwitcher />
          Select a source to view items.
        </div>
      )}
    </>
  );
}

function ItemsContent({ sourceId }: { sourceId: number }) {
  const { itemId } = useParams();
  const itemIdNum = itemId ? Number(itemId) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useQueryState(
    'filter',
    parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'),
  );
  const [sort, setSort] = useQueryState(
    'sort',
    parseAsStringLiteral(['recency', 'title'] as const).withDefault('recency'),
  );
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [selectedIds, setSelectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const [sessionId, setOpenSessionId] = useQueryState('session', parseAsInteger);

  function setSelection(newAnchor: number | null, newExtras: number[]) {
    const filtered = newExtras.filter(eid => eid !== newAnchor);
    if (newAnchor === itemIdNum) {
      setSelectedIds(filtered.length === 0 ? null : filtered);
      return;
    }
    const params = new URLSearchParams();
    params.set('source', String(sourceId));
    if (filter !== 'open') params.set('filter', filter);
    if (sort !== 'recency') params.set('sort', sort);
    if (query) params.set('q', query);
    if (filtered.length > 0) params.set('selected', filtered.join(','));
    if (sessionId !== null) params.set('session', String(sessionId));
    const path = newAnchor !== null ? `/items/${newAnchor}` : `/items`;
    navigate({ pathname: path, search: params.toString() });
  }

  function clearSelection() {
    setSelection(null, []);
  }

  const sourceQuery = useSuspenseQuery({
    queryKey: ['source', sourceId],
    queryFn: () => api.getSource(sourceId),
  });
  const source = sourceQuery.data;

  const itemsQuery = useSuspenseQuery({
    queryKey: ['items', sourceId, filter, sort],
    queryFn: () => api.listItems(sourceId, filter, sort),
  });
  const allItems = itemsQuery.data;

  const items = useFuzzySearch(allItems, query);

  const visibleIds = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const validSelectedIds = useMemo(() => selectedIds.filter(eid => visibleIds.has(eid)), [selectedIds, visibleIds]);
  const validItemIdNum = itemIdNum !== null && visibleIds.has(itemIdNum) ? itemIdNum : null;
  const selection = useMemo(() => {
    const set = new Set<number>(validSelectedIds);
    if (validItemIdNum !== null) set.add(validItemIdNum);
    return set;
  }, [validSelectedIds, validItemIdNum]);

  const countsQuery = useQuery({
    queryKey: ['itemCounts', sourceId],
    queryFn: () => api.getItemCounts(sourceId),
  });
  const counts = countsQuery.data ?? { open: 0, resolved: 0 };

  useEffect(() => {
    const valid = FILTER_TABS[source.type].some(t => t.value === filter);
    if (!valid) setFilter('open');
  }, [source.type, filter, setFilter]);

  useEffect(() => {
    if (items.length === 0) return;
    if (validItemIdNum !== null) return;
    const params = new URLSearchParams(window.location.search);
    navigate({ pathname: `/items/${items[0].id}`, search: params.toString() }, { replace: true });
  }, [items, validItemIdNum, navigate]);

  const createNotebookMutation = useMutation({
    mutationFn: () => api.createNotebook(),
    onSuccess: notebook => {
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
      const params = new URLSearchParams(window.location.search);
      navigate({ pathname: `/items/${notebook.id}`, search: params.toString() });
    },
  });

  const error = itemsQuery.error instanceof Error ? itemsQuery.error.message : null;

  function selectItem(clickedId: number, modifiers: { shiftKey: boolean; metaKey: boolean }) {
    const anchor = validItemIdNum;
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

  function onFilterChange(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    clearSelection();
  }

  const loading = itemsQuery.isLoading;

  return (
    <>
      <title>{`${source.ext_id} · Items`}</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <h1 className='text-lg font-semibold'>Items</h1>
              <SourceSwitcher />
              <FilterTabs sourceType={source.type} value={filter} onChange={onFilterChange} counts={counts} />
            </div>
            <div className='flex items-center gap-2'>
              {source.type === 'notes' && (
                <button
                  onClick={() => createNotebookMutation.mutate()}
                  disabled={createNotebookMutation.isPending}
                  className='btn-md btn-primary'
                >
                  {createNotebookMutation.isPending ? 'Creating…' : 'New notebook'}
                </button>
              )}
              <SyncItemsButton />
            </div>
          </div>

          <div className='mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2'>
            <SortBar sourceType={source.type} filter={filter} sort={sort} onChange={setSort} />
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
              ) : filter === 'open' ? (
                <>
                  No items yet. Click <b>Sync</b> to {EMPTY_OPEN_SYNC[source.type]}.
                </>
              ) : (
                <>No {currentTabLabel(source.type, filter).toLowerCase()} items yet.</>
              )}
            </p>
          ) : (
            <ul className='flex flex-col gap-2'>
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={selection.has(item.id)}
                  onSelect={selectItem}
                  onOpenSession={sessionId => setOpenSessionId(sessionId)}
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

function tabsFor(sourceType: ItemType): FilterTab[] {
  return FILTER_TABS[sourceType];
}

function currentTab(sourceType: ItemType, value: Filter): FilterTab {
  return tabsFor(sourceType).find(t => t.value === value) ?? tabsFor(sourceType)[0];
}

function currentTabLabel(sourceType: ItemType, value: Filter): string {
  return currentTab(sourceType, value).label;
}

function FilterTabs({
  sourceType,
  value,
  onChange,
  counts,
}: {
  sourceType: ItemType;
  value: Filter;
  onChange: (v: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const tabs = tabsFor(sourceType);
  return (
    <TabsRoot value={value} onValueChange={v => onChange(v as Filter)}>
      <PillTabsList>
        {tabs.map(tab => (
          <PillTabsTab key={tab.value} value={tab.value}>
            {tab.label} <span className='ml-1 text-gray-400'>({counts[tab.value]})</span>
          </PillTabsTab>
        ))}
      </PillTabsList>
    </TabsRoot>
  );
}

function SortBar({
  sourceType,
  filter,
  sort,
  onChange,
}: {
  sourceType: ItemType;
  filter: Filter;
  sort: Sort;
  onChange: (s: Sort) => void;
}) {
  const recencyLabel = currentTab(sourceType, filter).recencyLabel;
  const hint = sort === 'title' ? '(A → Z)' : '(newest first)';
  return (
    <div className='flex items-center gap-2 text-xs text-gray-500'>
      <span>Sorted by</span>
      <Select<Sort>
        ariaLabel='Sort'
        value={sort}
        onChange={onChange}
        options={[
          { value: 'recency', label: recencyLabel },
          { value: 'title', label: 'Title' },
        ]}
      />
      <span className='text-gray-400'>{hint}</span>
    </div>
  );
}
