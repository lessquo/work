import Fuse from 'fuse.js';
import { useMemo } from 'react';

export function useFuzzySearch<T extends { key: string; title: string; status: string; url: string }>(
  items: T[],
  query: string,
): T[] {
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        useTokenSearch: true,
        keys: ['key', 'title', 'status', 'url'],
      }),
    [items],
  );
  return useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return items;
    return fuse.search(q).map(r => r.item);
  }, [items, fuse, query]);
}
