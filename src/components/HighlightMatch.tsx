import { FuseResultMatch } from 'fuse.js';
import { Fragment, ReactNode } from 'react';

export function HighlightMatch({
  text,
  matches,
  field,
}: {
  text: string;
  matches?: ReadonlyArray<FuseResultMatch>;
  field: string;
}) {
  const indices = matches?.find(m => m.key === field)?.indices;
  if (!indices || indices.length === 0) return <>{text}</>;
  const merged = mergeRanges(indices);
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) out.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, start)}</Fragment>);
    out.push(
      <mark key={`m${start}`} className='bg-inherit text-blue-600'>
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }
  if (cursor < text.length) out.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
  return <>{out}</>;
}

function mergeRanges(indices: ReadonlyArray<readonly [number, number]>): [number, number][] {
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}
