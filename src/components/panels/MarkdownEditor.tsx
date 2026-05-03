import { Markdown } from '@/components/panels/Markdown';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';

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
  className?: string;
}) {
  const effectiveMode: MarkdownEditorMode = readOnly ? 'preview' : mode;
  return (
    <div className={cn('group relative flex flex-col bg-white', className)}>
      <div className='pointer-events-none sticky top-0 z-10 flex h-0 translate-y-4 items-start justify-end gap-2 px-4 opacity-0 group-hover:opacity-100'>
        {statusText && (
          <span
            className={cn(
              'pointer-events-auto rounded bg-white/90 px-1.5 py-0.5 text-[11px]',
              statusError ? 'text-rose-600' : 'text-gray-500',
            )}
          >
            {statusText}
          </span>
        )}
        {!readOnly && (
          <TabsRoot value={mode} onValueChange={v => setMode(v as MarkdownEditorMode)} className='pointer-events-auto'>
            <PillTabsList>
              <PillTabsTab value='preview' size='sm'>
                Preview
              </PillTabsTab>
              <PillTabsTab value='edit' size='sm'>
                Edit
              </PillTabsTab>
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
          className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 outline-none disabled:bg-gray-50 disabled:text-gray-500'
        />
      ) : (
        <div className='min-h-0 flex-1 overflow-auto bg-white p-4 text-sm text-gray-800'>
          {value.trim() ? <Markdown>{value}</Markdown> : <p className='text-gray-400'>(empty)</p>}
        </div>
      )}
    </div>
  );
}
