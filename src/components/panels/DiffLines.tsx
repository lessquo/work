import { cn } from '@/lib/cn';

export type DiffLineKind = 'add' | 'del' | 'ctx' | 'hunk' | 'meta';
export type DiffLine = { kind: DiffLineKind; text: string };

export function DiffLines({
  lines,
  showPrefix = false,
  className,
}: {
  lines: DiffLine[];
  showPrefix?: boolean;
  className?: string;
}) {
  return (
    <pre className={cn('overflow-x-auto leading-relaxed whitespace-pre', className)}>
      <div className='inline-block min-w-full'>
        {lines.map((l, i) => (
          <div key={i} className={cn('px-2', DIFF_LINE_CLASS[l.kind])}>
            {showPrefix && (
              <span className='select-none'>{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '} </span>
            )}
            {l.text || ' '}
          </div>
        ))}
      </div>
    </pre>
  );
}

const DIFF_LINE_CLASS: Record<DiffLineKind, string> = {
  add: 'bg-emerald-50 text-emerald-900',
  del: 'bg-rose-50 text-rose-900',
  hunk: 'bg-sky-50 text-sky-800',
  meta: 'text-gray-400',
  ctx: 'text-gray-700',
};
