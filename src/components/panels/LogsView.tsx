import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

type Block =
  | { kind: 'event'; time: string; verb: string; message: string }
  | { kind: 'tool'; name: string; input: string }
  | { kind: 'result'; ok: boolean; message: string }
  | { kind: 'prompt'; promptId: string; body: string }
  | { kind: 'text'; body: string };

type View = 'pretty' | 'raw';

export function LogsView({ text, isRunning = false }: { text: string; isRunning?: boolean }) {
  const [view, setView] = useState<View>('pretty');
  const stripped = stripAnsi(text);
  if (!stripped) {
    return isRunning ? <RunningIndicator /> : <span className='text-gray-500'>(no output)</span>;
  }
  return (
    <div className='group flex flex-col gap-1.5'>
      <div className='pointer-events-none sticky top-0 z-10 flex h-0 justify-end opacity-0 group-hover:opacity-100'>
        <TabsRoot value={view} onValueChange={v => setView(v as View)} className='pointer-events-auto'>
          <PillTabsList>
            <PillTabsTab value='pretty'>Pretty</PillTabsTab>
            <PillTabsTab value='raw'>Raw</PillTabsTab>
          </PillTabsList>
        </TabsRoot>
      </div>
      {view === 'pretty' ? (
        parseBlocks(stripped).map((b, i) => <BlockRow key={i} block={b} />)
      ) : (
        <pre className='leading-relaxed whitespace-pre-wrap text-gray-700'>{stripped}</pre>
      )}
    </div>
  );
}

function RunningIndicator() {
  return (
    <span className='inline-flex items-center gap-1.5 text-gray-500'>
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
    <div className='flex gap-2 leading-relaxed'>
      <span className='shrink-0 text-gray-400'>{shortTime(time)}</span>
      <span className={cn('font-medium', cls)}>{message}</span>
    </div>
  );
}

function ToolRow({ name, input }: { name: string; input: string }) {
  const { formatted, summary } = parseToolInput(input);
  return (
    <details className='rounded border border-gray-300 bg-gray-50'>
      <summary className='flex cursor-pointer items-center gap-2 px-2 py-1'>
        <span className='shrink-0 text-[11px] font-semibold tracking-wide text-gray-700 uppercase'>{name}</span>
        {summary && <span className='truncate text-gray-500'>{summary}</span>}
      </summary>
      <pre className='overflow-x-auto border-t border-gray-300 px-2 py-1.5 leading-relaxed whitespace-pre-wrap text-gray-700'>
        {formatted}
      </pre>
    </details>
  );
}

const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt'] as const;

function parseToolInput(input: string): { formatted: string; summary: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { formatted: input, summary: trimmed.split('\n')[0] };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const formatted = JSON.stringify(parsed, null, 2);
    let summary = '';
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      for (const key of SUMMARY_KEYS) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) {
          summary = v.trim().split('\n')[0];
          break;
        }
      }
    }
    return { formatted, summary };
  } catch {
    return { formatted: input, summary: trimmed.split('\n')[0] };
  }
}

function ResultRow({ ok, message }: { ok: boolean; message: string }) {
  const tone = ok
    ? { border: 'border-emerald-300', bg: 'bg-emerald-50', label: 'text-emerald-700' }
    : { border: 'border-rose-300', bg: 'bg-rose-50', label: 'text-rose-700' };
  return (
    <div className={cn('rounded border-l-2', tone.border, tone.bg)}>
      <div className={cn('px-2 py-1 text-[11px] font-semibold tracking-wide uppercase', tone.label)}>
        {ok ? 'Result' : 'Result · error'}
      </div>
      {message && <div className='px-2 pb-1.5 leading-relaxed whitespace-pre-wrap text-gray-800'>{message}</div>}
    </div>
  );
}

function PromptRow({ promptId, body }: { promptId: string; body: string }) {
  return (
    <details className='rounded border border-purple-100 bg-purple-50/40'>
      <summary className='flex cursor-pointer items-center gap-2 px-2 py-1'>
        <span className='text-[11px] font-semibold tracking-wide text-purple-700 uppercase'>Prompt</span>
        <span className='text-gray-500'>{promptId}</span>
      </summary>
      <pre className='overflow-x-auto border-t border-purple-100 px-2 py-1.5 leading-relaxed whitespace-pre-wrap text-gray-700'>
        {body}
      </pre>
    </details>
  );
}

function TextRow({ body }: { body: string }) {
  return <div className='leading-relaxed whitespace-pre-wrap text-gray-700'>{body}</div>;
}

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
