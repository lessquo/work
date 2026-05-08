import { MarkdownEditor, type MarkdownEditorMode } from '@/components/MarkdownEditor';
import { api, type Prompt } from '@/lib/api';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

export function PromptTemplateEditor({ prompt, readOnly = false }: { prompt: Prompt; readOnly?: boolean }) {
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
    disabled: readOnly,
  });

  const [mode, setMode] = useState<MarkdownEditorMode>('preview');

  const statusText = readOnly
    ? 'Read-only'
    : status === 'error' && error
      ? `Save failed: ${error.message}`
      : status === 'saving'
        ? 'Saving…'
        : status === 'unsaved'
          ? 'Unsaved…'
          : status === 'saved'
            ? 'Saved ✓'
            : null;

  return (
    <MarkdownEditor
      value={draft}
      onChange={setDraft}
      mode={mode}
      setMode={setMode}
      readOnly={readOnly}
      placeholder={`Edit the ${prompt.id} prompt…`}
      statusText={statusText}
      statusError={!readOnly && status === 'error' && !!error}
      className='min-h-0 flex-1'
    />
  );
}
