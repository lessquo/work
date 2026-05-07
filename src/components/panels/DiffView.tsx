import { DiffLines, type DiffLine } from '@/components/panels/DiffLines';
import { api } from '@/lib/api';
import { useSuspenseQuery } from '@tanstack/react-query';

type DiffFile = {
  path: string;
  added: number;
  removed: number;
  lines: DiffLine[];
};

export function DiffView({ sessionId }: { sessionId: number }) {
  const { data } = useSuspenseQuery({
    queryKey: ['session', sessionId, 'diff'],
    queryFn: () => api.getSessionDiff(sessionId),
    staleTime: Infinity,
  });
  const files = parseDiff(data ?? '');
  if (files.length === 0) {
    return <p className='text-sm text-gray-500'>(no changes)</p>;
  }
  const totalAdded = files.reduce((n, f) => n + f.added, 0);
  const totalRemoved = files.reduce((n, f) => n + f.removed, 0);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between text-xs text-gray-500'>
        <span>
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </span>
        <span>
          <span className='font-mono text-emerald-700'>+{totalAdded}</span>{' '}
          <span className='font-mono text-rose-700'>-{totalRemoved}</span>
        </span>
      </div>
      {files.map((file, i) => (
        <FileBlock key={i} file={file} />
      ))}
    </div>
  );
}

function FileBlock({ file }: { file: DiffFile }) {
  return (
    <div className='overflow-hidden rounded-md border'>
      <div className='sticky top-0 flex items-center justify-between border-b bg-gray-50 px-3 py-2 text-xs'>
        <span className='truncate font-mono text-gray-800'>{file.path}</span>
        <span className='shrink-0 pl-3'>
          <span className='font-mono text-emerald-700'>+{file.added}</span>{' '}
          <span className='font-mono text-rose-700'>-{file.removed}</span>
        </span>
      </div>
      <DiffLines lines={file.lines} className='bg-white font-mono text-xs' />
    </div>
  );
}

function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      if (current) files.push(current);
      const m = raw.match(/ b\/(.+)$/);
      current = {
        path: m ? m[1] : raw.slice('diff --git '.length),
        added: 0,
        removed: 0,
        lines: [],
      };
      continue;
    }
    if (!current) continue;

    if (raw.startsWith('@@')) {
      current.lines.push({ kind: 'hunk', text: raw });
    } else if (
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('new file mode') ||
      raw.startsWith('deleted file mode') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('Binary files')
    ) {
      // skip git metadata in the body — file header above already shows the path
    } else if (raw.startsWith('+')) {
      current.lines.push({ kind: 'add', text: raw });
      current.added++;
    } else if (raw.startsWith('-')) {
      current.lines.push({ kind: 'del', text: raw });
      current.removed++;
    } else if (raw.startsWith('\\')) {
      current.lines.push({ kind: 'meta', text: raw });
    } else {
      current.lines.push({ kind: 'ctx', text: raw });
    }
  }
  if (current) files.push(current);
  return files;
}
