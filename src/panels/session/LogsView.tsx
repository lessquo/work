import { Markdown } from '@/components/Markdown';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { DiffLines, type DiffLine } from '@/panels/session/DiffLines';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Circle, CircleCheck, CircleDot, Loader2 } from 'lucide-react';
import { Fragment, useState, type ReactNode, type Ref, type UIEvent } from 'react';

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
        {!text ? (
          isRunning ? (
            <RunningIndicator />
          ) : (
            <span className='block px-4 py-2 text-gray-500'>(no output)</span>
          )
        ) : view === 'pretty' ? (
          parseMessages(text).map((m, i) => <MessageRows key={i} msg={m} />)
        ) : (
          <pre className='px-4 py-2 leading-relaxed whitespace-pre-wrap text-gray-700'>{text}</pre>
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

function MessageRows({ msg }: { msg: SDKMessage }) {
  if (msg.type === 'assistant' || msg.type === 'user') {
    const { content } = msg.message;
    const blocks = typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
    return (
      <>
        {blocks.map((c, i) => {
          if (c.type === 'text' && c.text) {
            return (
              <Row key={i} label={msg.type} color={MESSAGE_COLOR[msg.type]} markdown>
                <Markdown>{c.text}</Markdown>
              </Row>
            );
          }
          if (c.type === 'tool_use') {
            const input = typeof c.input === 'string' ? c.input : JSON.stringify(c.input);
            return (
              <Row key={i} label={c.name} color={TOOL_COLOR[c.name] ?? 'text-gray-700'}>
                <ToolBody name={c.name} input={input} />
              </Row>
            );
          }
          return null;
        })}
      </>
    );
  }
  if (msg.type === 'result') {
    if (msg.subtype === 'success') {
      return msg.result ? (
        <Row label='result' color={MESSAGE_COLOR.result} markdown>
          <Markdown>{msg.result}</Markdown>
        </Row>
      ) : null;
    }
    return <Row label='result error' color={MESSAGE_COLOR['result error']} markdown />;
  }
  return null;
}

function Row({
  label,
  color,
  markdown = false,
  children,
}: {
  label: string;
  color: string;
  markdown?: boolean;
  divider?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-2',
        markdown && '[&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_p]:text-xs [&_table]:text-xs',
      )}
    >
      <div className={cn('shrink-0 text-xs leading-relaxed font-semibold tracking-wide uppercase', color)}>{label}</div>
      <div className={cn('min-w-0 flex-1', markdown && 'leading-relaxed text-gray-700 *:first:mt-0 *:last:mb-0')}>
        {children}
      </div>
    </div>
  );
}

function ToolBody({ name, input }: { name: string; input: string }) {
  const edit = name === 'Edit' ? parseEditInput(input) : null;
  const todos = name === 'TodoWrite' ? parseTodosInput(input) : null;
  const { entries, formatted } = parseToolInput(input);
  const gridEntries = edit ? edit.entries : todos ? todos.entries : entries;
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
      {todos && <TodoList todos={todos.todos} />}
    </>
  );
}

type Todo = { content: string; activeForm: string; status: 'pending' | 'in_progress' | 'completed' };

function parseTodosInput(input: string): { entries: [string, string][]; todos: Todo[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!Array.isArray(parsed.todos)) return null;
    const entries: [string, string][] = Object.entries(parsed)
      .filter(([k]) => k !== 'todos')
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v, null, 2)]);
    return { entries, todos: parsed.todos as Todo[] };
  } catch {
    return null;
  }
}

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className='flex flex-col gap-1 text-xs leading-relaxed'>
      {todos.map((t, i) => {
        const Icon = t.status === 'completed' ? CircleCheck : t.status === 'in_progress' ? CircleDot : Circle;
        const iconColor =
          t.status === 'completed'
            ? 'text-emerald-600'
            : t.status === 'in_progress'
              ? 'text-amber-600'
              : 'text-gray-400';
        return (
          <li key={i} className='flex items-start gap-2'>
            <Icon className={cn('mt-0.5 size-3.5 shrink-0', iconColor)} />
            <span className={cn(t.status === 'completed' && 'text-gray-500 line-through')}>
              {t.status === 'in_progress' ? t.activeForm : t.content}
            </span>
          </li>
        );
      })}
    </ul>
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

const MESSAGE_COLOR = {
  user: 'text-purple-700',
  assistant: 'text-gray-700',
  result: 'text-emerald-700',
  'result error': 'text-rose-700',
} as const;

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

function parseMessages(text: string): SDKMessage[] {
  const out: SDKMessage[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as SDKMessage);
    } catch {
      continue;
    }
  }
  return out;
}
