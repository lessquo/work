import { Markdown } from '@/components/panels/Markdown';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { api, type Prompt } from '@/lib/api';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

type PromptEditorMode = 'edit' | 'preview';

export function PromptTemplateEditor({ prompt }: { prompt: Prompt }) {
  const queryKey = ['prompt', prompt.id] as const;
  const tplQuery = useSuspenseQuery({
    queryKey,
    queryFn: () => api.getPromptTemplate(prompt.id),
    staleTime: Infinity,
  });

  const { draft, setDraft, status, error } = useDraftEditor({
    queryKey,
    loaded: tplQuery.data,
    save: (content: string) => api.updatePromptTemplate(prompt.id, content),
  });

  const [mode, setMode] = useState<PromptEditorMode>('preview');

  return (
    <div className='flex min-h-0 flex-1 flex-col bg-white'>
      <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
        <div className='flex min-w-0 items-center gap-3'>
          <TabsRoot value={mode} onValueChange={v => setMode(v as PromptEditorMode)}>
            <PillTabsList>
              <PillTabsTab value='preview' size='sm'>
                Preview
              </PillTabsTab>
              <PillTabsTab value='edit' size='sm'>
                Edit
              </PillTabsTab>
            </PillTabsList>
          </TabsRoot>
          <span className='min-w-0 truncate text-gray-500'>
            <code className='font-mono text-gray-700'>{prompt.id}</code>
            {prompt.hint && <span className='ml-2'>· {prompt.hint}</span>}
          </span>
        </div>
        <span className='shrink-0'>
          {status === 'error' && error ? (
            <span className='text-rose-600'>Save failed: {error.message}</span>
          ) : status === 'saving' ? (
            <span className='text-gray-500'>Saving…</span>
          ) : status === 'unsaved' ? (
            <span className='text-gray-500'>Unsaved…</span>
          ) : status === 'saved' ? (
            <span className='text-emerald-600'>Saved ✓</span>
          ) : null}
        </span>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          spellCheck={false}
          placeholder={`Edit the ${prompt.label} prompt…`}
          className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 outline-none'
        />
      ) : (
        <div className='min-h-0 flex-1 overflow-auto bg-white p-4 text-sm text-gray-800'>
          {draft.trim() ? <Markdown>{draft}</Markdown> : <p className='text-gray-400'>(empty)</p>}
        </div>
      )}
    </div>
  );
}
