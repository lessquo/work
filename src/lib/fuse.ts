import Fuse, { type FuseResult } from 'fuse.js';
import { useDeferredValue, useMemo } from 'react';

const DEFAULT_KEYS = ['key', 'title'];

export function useFuzzySearch<T>(items: T[], query: string, keys: string[] = DEFAULT_KEYS): FuseResult<T>[] {
  const deferredQuery = useDeferredValue(query);
  const fuse = useMemo(() => {
    const index = Fuse.createIndex(keys, items);
    return new Fuse(items, { keys, threshold: 0.4, useTokenSearch: true, includeMatches: true }, index);
  }, [items, keys]);
  return useMemo(() => {
    const q = deferredQuery.trim();
    if (q.length === 0) return items.map((item, refIndex) => ({ item, refIndex }));
    return fuse.search(q, { limit: 20 });
  }, [items, fuse, deferredQuery]);
}
