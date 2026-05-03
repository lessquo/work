import { HighlightMatch } from '@/components/HighlightMatch';
import { Input } from '@/components/ui/Input';
import { api, parseMarkdownRaw, type Item } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFuzzySearch } from '@/lib/fuse';
import { Combobox } from '@base-ui/react/combobox';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useMemo, useState } from 'react';

type SectionItem = { id: string; mdId: number; mdTitle: string; key: string; title: string; body: string };
type SectionGroup = { id: number; label: string; items: SectionItem[] };

const SEARCH_KEYS = ['key', 'title', 'mdTitle'];

function splitLevel2Sections(body: string): Array<{ title: string; body: string }> {
  const lines = body.split('\n');
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      current = { title: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  return sections;
}

export function InsertMarkdownButton({ onInsert }: { onInsert: (section: { title: string; body: string }) => void }) {
  const markdownsQuery = useQuery({ queryKey: ['markdowns'], queryFn: api.listMarkdowns });
  const markdowns = markdownsQuery.data ?? [];

  const detailQueries = useQueries({
    queries: markdowns.map(md => ({
      queryKey: ['markdown', md.id],
      queryFn: () => api.getMarkdown(md.id),
      enabled: markdowns.length > 0,
    })),
  });

  const groups = useMemo<SectionGroup[]>(() => {
    const out: SectionGroup[] = [];
    for (const q of detailQueries) {
      const md: Item | undefined = q.data;
      if (!md) continue;
      const body = parseMarkdownRaw(md.raw).body ?? '';
      const sections = splitLevel2Sections(body);
      if (sections.length === 0) continue;
      out.push({
        id: md.id,
        label: md.title,
        items: sections.map((s, i) => ({
          id: `${md.id}-${i}`,
          mdId: md.id,
          mdTitle: md.title,
          key: String(i + 1),
          title: s.title,
          body: s.body,
        })),
      });
    }
    return out;
  }, [detailQueries]);

  const flatItems = useMemo<SectionItem[]>(() => groups.flatMap(g => g.items), [groups]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useFuzzySearch(flatItems, query, SEARCH_KEYS);
  const matchesById = useMemo(() => new Map(results.map(r => [r.item.id, r.matches])), [results]);

  // Regroup the fuse-filtered items, preserving group order. Groups with no matches are dropped
  // so the popup collapses cleanly when filtering.
  const filteredGroups = useMemo<SectionGroup[]>(() => {
    const survivors = new Set(results.map(r => r.item.id));
    return groups
      .map(g => ({ ...g, items: g.items.filter(it => survivors.has(it.id)) }))
      .filter(g => g.items.length > 0);
  }, [groups, results]);

  return (
    <Combobox.Root<SectionItem>
      items={groups}
      filteredItems={filteredGroups}
      inputValue={query}
      onInputValueChange={setQuery}
      value={null}
      onValueChange={item => {
        if (item) onInsert({ title: item.title, body: item.body });
      }}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Combobox.Trigger className={cn('btn-sm btn-neutral', 'data-popup-open:bg-gray-100')}>
        <FileText />
        Insert markdown
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4}>
          <Combobox.Popup className='popup flex max-h-128 w-lg flex-col overflow-hidden' aria-label='Insert markdown'>
            <div className='p-2'>
              <Combobox.Input
                placeholder='Search by markdown or section heading…'
                render={<Input type='search' className='w-full' />}
              />
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <Combobox.Empty className='px-3 py-2 text-xs text-gray-400'>
                {markdowns.length === 0
                  ? 'No markdown items yet.'
                  : flatItems.length === 0
                    ? '(no level-2 sections)'
                    : 'No sections match your search.'}
              </Combobox.Empty>
              <Combobox.List>
                {(group: SectionGroup) => {
                  const labelMatches = matchesById.get(group.items[0]?.id);
                  return (
                    <Combobox.Group key={group.id} items={group.items}>
                      <Combobox.GroupLabel className='combobox-group-label'>
                        <HighlightMatch text={group.label} matches={labelMatches} field='mdTitle' />
                      </Combobox.GroupLabel>
                      <Combobox.Collection>
                        {(item: SectionItem) => {
                          const matches = matchesById.get(item.id);
                          return (
                            <Combobox.Item key={item.id} value={item} className='combobox-item'>
                              <span className='inline-block w-4 shrink-0 text-right font-mono text-[11px] text-gray-500'>
                                {item.key}
                              </span>
                              <span className='truncate'>
                                <HighlightMatch text={item.title} matches={matches} field='title' />
                              </span>
                            </Combobox.Item>
                          );
                        }}
                      </Combobox.Collection>
                    </Combobox.Group>
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
