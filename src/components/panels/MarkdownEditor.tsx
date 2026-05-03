import { Markdown } from '@/components/panels/Markdown';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { Trash2 } from 'lucide-react';

export type MarkdownEditorMode = 'edit' | 'preview';

export function MarkdownEditor({
  value,
  onChange,
  mode,
  setMode,
  placeholder,
  disabled = false,
  readOnly = false,
  spellCheck = false,
  statusText,
  statusError = false,
  toolbar,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: MarkdownEditorMode;
  setMode: (m: MarkdownEditorMode) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  spellCheck?: boolean;
  statusText?: React.ReactNode;
  statusError?: boolean;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const effectiveMode: MarkdownEditorMode = readOnly ? 'preview' : mode;
  return (
    <div className={cn('group relative flex flex-col bg-white', className)}>
      <div className='pointer-events-none sticky top-0 z-10 flex h-0 translate-y-4 items-start justify-end gap-2 px-4 opacity-0 group-hover:opacity-100'>
        {statusText && (
          <span
            className={cn(
              'pointer-events-auto rounded bg-white/90 px-1.5 py-0.5 text-xs',
              statusError ? 'text-rose-600' : 'text-gray-500',
            )}
          >
            {statusText}
          </span>
        )}
        {toolbar && <div className='pointer-events-auto flex items-center gap-2'>{toolbar}</div>}
        {!readOnly && (
          <TabsRoot value={mode} onValueChange={v => setMode(v as MarkdownEditorMode)} className='pointer-events-auto'>
            <PillTabsList>
              <PillTabsTab value='preview'>Preview</PillTabsTab>
              <PillTabsTab value='edit'>Edit</PillTabsTab>
            </PillTabsList>
          </TabsRoot>
        )}
      </div>
      {effectiveMode === 'edit' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={spellCheck}
          placeholder={placeholder}
          className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-sm leading-relaxed text-gray-800 outline-none disabled:bg-gray-50 disabled:text-gray-500'
        />
      ) : (
        <div className='min-h-0 flex-1 overflow-auto bg-white p-4 text-gray-800'>
          {value.trim() ? (
            readOnly ? (
              <Markdown>{value}</Markdown>
            ) : (
              <EditablePreview value={value} onChange={onChange} />
            )
          ) : (
            <p className='text-gray-400'>(empty)</p>
          )}
        </div>
      )}
    </div>
  );
}

function EditablePreview({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const sections = splitSections(value);
  const confirm = useConfirm();

  async function handleDelete(index: number, headingText: string) {
    const ok = await confirm({
      title: `Delete section "${headingText}"?`,
      description: 'This removes the heading and all of its content from the markdown.',
      destructive: true,
      confirmText: 'Delete',
    });
    if (!ok) return;
    const next = sections
      .filter((_, i) => i !== index)
      .map(s => s.text)
      .join('\n');
    onChange(next);
  }

  return (
    <>
      {sections.map((s, i) =>
        s.kind === 'preamble' ? (
          <Markdown key={i}>{s.text}</Markdown>
        ) : (
          <div key={i} className='group/section relative'>
            <button
              type='button'
              onClick={() => handleDelete(i, s.heading)}
              aria-label={`Delete section "${s.heading}"`}
              className='btn-sm btn-ghost absolute top-0 right-0 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100'
            >
              <Trash2 />
            </button>
            <Markdown>{s.text}</Markdown>
          </div>
        ),
      )}
    </>
  );
}

type Section = { kind: 'preamble'; text: string } | { kind: 'section'; text: string; heading: string };

function splitSections(md: string): Section[] {
  const lines = md.split('\n');
  const headingLineIndices: number[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(```|~~~)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
      }
      continue;
    }
    if (!inFence && /^## /.test(line)) headingLineIndices.push(i);
  }

  if (headingLineIndices.length === 0) return [{ kind: 'preamble', text: md }];

  const sections: Section[] = [];
  if (headingLineIndices[0] > 0) {
    sections.push({ kind: 'preamble', text: lines.slice(0, headingLineIndices[0]).join('\n') });
  }
  for (let s = 0; s < headingLineIndices.length; s++) {
    const start = headingLineIndices[s];
    const end = headingLineIndices[s + 1] ?? lines.length;
    const text = lines.slice(start, end).join('\n');
    const heading = lines[start].replace(/^##\s+/, '').trim();
    sections.push({ kind: 'section', text, heading });
  }
  return sections;
}
