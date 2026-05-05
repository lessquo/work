import { Markdown } from '@/components/panels/Markdown';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Fragment, useState, type Ref, type UIEvent } from 'react';

type Block =
  | { kind: 'event'; time: string; verb: string; message: string }
  | { kind: 'tool'; name: string; input: string }
  | { kind: 'result'; ok: boolean; message: string }
  | { kind: 'prompt'; promptId: string; body: string }
  | { kind: 'text'; body: string };

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
      <div ref={scrollRef} onScroll={onScroll} className='min-h-0 flex-1 overflow-auto'>
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
  switch (block.kind) {
    case 'event':
      return <EventRow time={block.time} verb={block.verb} message={block.message} />;
    case 'tool':
      return <ToolRow name={block.name} input={block.input} />;
    case 'result':
      return <ResultRow ok={block.ok} message={block.message} />;
    case 'prompt':
      return <PromptRow promptId={block.promptId} body={block.body} />;
    case 'text':
      return <TextRow body={block.body} />;
  }
}

function EventRow({ time, verb, message }: { time: string; verb: string; message: string }) {
  const cls = VERB_CLASS[verb] ?? 'text-gray-700';
  return (
    <div className='flex gap-2 px-4 py-2 leading-relaxed'>
      <span className='shrink-0 text-gray-400'>{shortTime(time)}</span>
      <span className={cn('font-medium', cls)}>{message}</span>
    </div>
  );
}

function ToolRow({ name, input }: { name: string; input: string }) {
  const { entries, formatted } = parseToolInput(input);
  return (
    <div className='flex gap-3 px-4 py-2'>
      <div
        className={cn(
          'shrink-0 text-xs leading-relaxed font-semibold tracking-wide uppercase',
          TOOL_COLOR[name] ?? 'text-gray-700',
        )}
      >
        {name}
      </div>
      {entries ? (
        <div className='grid min-w-0 flex-1 grid-cols-[max-content_1fr] gap-x-3 gap-y-1 leading-relaxed'>
          {entries.map(([k, v]) => (
            <Fragment key={k}>
              <div className='text-gray-500'>{k}</div>
              <pre className='overflow-x-auto whitespace-pre-wrap text-gray-700'>{v}</pre>
            </Fragment>
          ))}
        </div>
      ) : (
        <pre className='min-w-0 flex-1 overflow-x-auto leading-relaxed whitespace-pre-wrap text-gray-700'>
          {formatted}
        </pre>
      )}
    </div>
  );
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

function ResultRow({ ok }: { ok: boolean; message: string }) {
  const tone = ok ? { label: 'text-emerald-700', Icon: CheckCircle2 } : { label: 'text-rose-700', Icon: XCircle };
  const { Icon } = tone;
  return (
    <div
      className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-semibold tracking-wide uppercase', tone.label)}
    >
      <Icon className='size-3.5' />
      {ok ? 'Result · success' : 'Result · error'}
    </div>
  );
}

function PromptRow({ promptId, body }: { promptId: string; body: string }) {
  return (
    <div className='px-4 py-2 text-gray-700 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_p]:text-xs [&_table]:text-xs'>
      <div className='flex items-center gap-2'>
        <span className='text-xs font-semibold tracking-wide text-purple-700 uppercase'>Prompt</span>
        <span className='text-gray-500'>{promptId}</span>
      </div>
      <div className='mt-1'>
        <Markdown>{body}</Markdown>
      </div>
    </div>
  );
}

function TextRow({ body }: { body: string }) {
  return (
    <div className='px-4 py-2 text-gray-700 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_p]:text-xs [&_table]:text-xs'>
      <Markdown>{body}</Markdown>
    </div>
  );
}

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

const VERB_CLASS: Record<string, string> = {
  cloning: 'text-sky-700',
  branched: 'text-sky-700',
  committed: 'text-emerald-700',
  aborted: 'text-amber-700',
  error: 'text-rose-700',
};

const ISO_RE = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\]\s+(.*)$/;
const TOOL_RE = /^\[tool:\s*([^\]]+)\]\s*(.*)$/;
const RESULT_RE = /^\[result(\s+error)?\]\s*(.*)$/;

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length === 0) return;
    const collapsed = collapseBlanks(textBuf);
    if (collapsed.length > 0) out.push({ kind: 'text', body: collapsed.join('\n') });
    textBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const eventM = line.match(ISO_RE);
    if (eventM) {
      flushText();
      const [, time, message] = eventM;
      const promptM = message.match(/^prompt:\s*(.+)$/);
      if (promptM && lines[i + 1] === '---') {
        const bodyLines: string[] = [];
        let j = i + 2;
        while (j < lines.length && lines[j] !== '---') {
          bodyLines.push(lines[j]);
          j++;
        }
        out.push({ kind: 'prompt', promptId: promptM[1].trim(), body: bodyLines.join('\n').trim() });
        i = j;
        continue;
      }
      const verb = message.split(/[:\s]/)[0] ?? '';
      out.push({ kind: 'event', time, verb, message });
      continue;
    }

    const toolM = line.match(TOOL_RE);
    if (toolM) {
      flushText();
      out.push({ kind: 'tool', name: toolM[1].trim(), input: toolM[2] });
      continue;
    }

    const resultM = line.match(RESULT_RE);
    if (resultM) {
      flushText();
      const ok = !resultM[1];
      const buf = [resultM[2]];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (ISO_RE.test(next) || TOOL_RE.test(next) || RESULT_RE.test(next)) break;
        buf.push(next);
        j++;
      }
      i = j - 1;
      while (buf.length > 0 && buf[buf.length - 1].trim() === '') buf.pop();
      out.push({ kind: 'result', ok, message: buf.join('\n').trim() });
      continue;
    }

    textBuf.push(line);
  }
  flushText();
  return out;
}

function collapseBlanks(lines: string[]): string[] {
  const out: string[] = [];
  let prevEmpty = true;
  for (const l of lines) {
    const empty = l.trim() === '';
    if (empty && prevEmpty) continue;
    out.push(l);
    prevEmpty = empty;
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function shortTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

function stripAnsi(s: string): string {
  // CSI sequences only. The ESC anchor (\x1b) matters: without it the regex
  // would also eat plain text like "[tool: Bash]".
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}
