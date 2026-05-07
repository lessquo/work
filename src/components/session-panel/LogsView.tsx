import { Markdown } from '@/components/Markdown';
import { DiffLines, type DiffLine } from '@/components/session-panel/DiffLines';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';
import { Fragment, useState, type Ref, type UIEvent } from 'react';

type Block = { subtype: string; body: string };

const TOOL_PREFIX = 'tool: ';
const toolName = (subtype: string): string | null =>
  subtype.startsWith(TOOL_PREFIX) ? subtype.slice(TOOL_PREFIX.length) : null;

type View = 'pretty' | 'raw';

export function LogsView({
  text,
  isRunning = false,
  scrollRef,
  onScroll,
}: {
  text: string;
  isRunning?: boolean;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
}) {
  const [view, setView] = useState<View>('pretty');
  const stripped = stripAnsi(text);
  return (
    <div className='group flex h-full flex-col'>
      <div className='pointer-events-none sticky top-0 z-10 flex h-0 items-center justify-end px-4 opacity-0 group-hover:opacity-100'>
        <TabsRoot value={view} onValueChange={v => setView(v as View)} className='pointer-events-auto'>
          <PillTabsList>
            <PillTabsTab value='pretty'>Pretty</PillTabsTab>
            <PillTabsTab value='raw'>Raw</PillTabsTab>
          </PillTabsList>
        </TabsRoot>
      </div>
      <div ref={scrollRef} onScroll={onScroll} tabIndex={0} className='min-h-0 flex-1 overflow-auto outline-none'>
        {!stripped ? (
          isRunning ? (
            <RunningIndicator />
          ) : (
            <span className='block px-4 py-2 text-gray-500'>(no output)</span>
          )
        ) : view === 'pretty' ? (
          parseBlocks(stripped).map((b, i) => <BlockRow key={i} block={b} />)
        ) : (
          <pre className='px-4 py-2 leading-relaxed whitespace-pre-wrap text-gray-700'>{stripped}</pre>
        )}
      </div>
    </div>
  );
}

function RunningIndicator() {
  return (
    <span className='inline-flex items-center gap-1.5 px-4 py-2 text-gray-500'>
      <Loader2 className='size-3.5 animate-spin' />
      Waiting for output…
    </span>
  );
}

function BlockRow({ block }: { block: Block }) {
  const tool = toolName(block.subtype);
  const label = tool ?? block.subtype;
  const color = tool ? (TOOL_COLOR[tool] ?? 'text-gray-700') : (MESSAGE_COLOR[block.subtype] ?? 'text-gray-700');
  const isUser = block.subtype === 'user';
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-2',
        !tool && '[&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_p]:text-xs [&_table]:text-xs',
        isUser && 'mt-2 border-t pt-3',
      )}
    >
      <div className={cn('shrink-0 text-xs leading-relaxed font-semibold tracking-wide uppercase', color)}>{label}</div>
      <div className={cn('min-w-0 flex-1', !tool && 'leading-relaxed text-gray-700 *:first:mt-0 *:last:mb-0')}>
        {tool ? <ToolBody name={tool} input={block.body} /> : <Markdown>{block.body}</Markdown>}
      </div>
    </div>
  );
}

function ToolBody({ name, input }: { name: string; input: string }) {
  const edit = name === 'Edit' ? parseEditInput(input) : null;
  const { entries, formatted } = parseToolInput(input);
  const gridEntries = edit ? edit.entries : entries;
  return (
    <>
      {gridEntries ? (
        gridEntries.length > 0 && (
          <div className='grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 leading-relaxed'>
            {gridEntries.map(([k, v]) => (
              <Fragment key={k}>
                <div className='text-gray-500'>{k}</div>
                <pre className='overflow-x-auto whitespace-pre-wrap text-gray-700'>{v}</pre>
              </Fragment>
            ))}
          </div>
        )
      ) : (
        <pre className='overflow-x-auto leading-relaxed whitespace-pre-wrap text-gray-700'>{formatted}</pre>
      )}
      {edit && <EditDiff oldStr={edit.oldStr} newStr={edit.newStr} />}
    </>
  );
}

function parseEditInput(input: string): { entries: [string, string][]; oldStr: string; newStr: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.old_string !== 'string' || typeof parsed.new_string !== 'string') return null;
    const entries: [string, string][] = Object.entries(parsed)
      .filter(([k]) => k !== 'old_string' && k !== 'new_string')
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v, null, 2)]);
    return { entries, oldStr: parsed.old_string, newStr: parsed.new_string };
  } catch {
    return null;
  }
}

function EditDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  return <DiffLines lines={lineDiff(oldStr, newStr)} showPrefix className='mt-1' />;
}

function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  if (oldStr === '') return newStr.split('\n').map(text => ({ kind: 'add', text }));
  if (newStr === '') return oldStr.split('\n').map(text => ({ kind: 'del', text }));
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matches: [number, number][] = [];
  for (let i = m, j = n; i > 0 && j > 0; ) {
    if (a[i - 1] === b[j - 1]) {
      matches.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  matches.reverse();
  const out: { kind: 'add' | 'del' | 'ctx'; text: string }[] = [];
  let ai = 0;
  let bi = 0;
  for (const [mi, mj] of matches) {
    while (ai < mi) out.push({ kind: 'del', text: a[ai++] });
    while (bi < mj) out.push({ kind: 'add', text: b[bi++] });
    out.push({ kind: 'ctx', text: a[mi] });
    ai = mi + 1;
    bi = mj + 1;
  }
  while (ai < m) out.push({ kind: 'del', text: a[ai++] });
  while (bi < n) out.push({ kind: 'add', text: b[bi++] });
  return out;
}

function parseToolInput(input: string): {
  entries: [string, string][] | null;
  formatted: string;
} {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { entries: null, formatted: input };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const formatted = JSON.stringify(parsed, null, 2);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const entries: [string, string][] = Object.entries(obj).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v, null, 2),
      ]);
      return { entries, formatted };
    }
    return { entries: null, formatted };
  } catch {
    return { entries: null, formatted: input };
  }
}

const MESSAGE_COLOR: Record<string, string> = {
  user: 'text-purple-700',
  assistant: 'text-gray-700',
  system: 'text-amber-700',
  event: 'text-sky-700',
  error: 'text-rose-700',
  result: 'text-emerald-700',
  'result error': 'text-rose-700',
};

const TOOL_COLOR: Record<string, string> = {
  Bash: 'text-amber-700',
  Read: 'text-sky-700',
  Edit: 'text-blue-700',
  Write: 'text-blue-700',
  NotebookEdit: 'text-blue-700',
  Glob: 'text-emerald-700',
  Grep: 'text-emerald-700',
  WebFetch: 'text-violet-700',
  WebSearch: 'text-violet-700',
  Task: 'text-fuchsia-700',
  TodoWrite: 'text-cyan-700',
};

const MSG_RE = /^\[msg:\s*([^\]]+)\]\s*(.*)$/;
const EVENT_RE = /^\[(event|error)\]\s*(.*)$/;

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MSG_RE) ?? lines[i].match(EVENT_RE);
    if (!m) continue;
    const subtype = m[1].trim();
    const buf = [m[2]];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (MSG_RE.test(next) || EVENT_RE.test(next)) break;
      buf.push(next);
      j++;
    }
    i = j - 1;
    while (buf.length > 0 && buf[buf.length - 1].trim() === '') buf.pop();
    out.push({ subtype, body: buf.join('\n').trim() });
  }
  return out;
}

function stripAnsi(s: string): string {
  // CSI sequences only. The ESC anchor (\x1b) matters: without it the regex
  // would also eat plain text like "[tool: Bash]".
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}
