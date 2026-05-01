import Fuse, { type FuseResult } from 'fuse.js';
import { useDeferredValue, useMemo } from 'react';

export function useFuzzySearch<T>(items: T[], query: string): FuseResult<T>[] {
  const deferredQuery = useDeferredValue(query);
  const fuse = useMemo(() => {
    const keys = ['key', 'title'];
    const index = Fuse.createIndex(keys, items);
    return new Fuse(items, { keys, threshold: 0.4, useTokenSearch: true, includeMatches: true }, index);
  }, [items]);
  return useMemo(() => {
    const q = deferredQuery.trim();
    if (q.length === 0) return items.map((item, refIndex) => ({ item, refIndex }));
    return fuse.search(q, { limit: 20 });
  }, [items, fuse, deferredQuery]);
}
