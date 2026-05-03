import { MarkdownEditor, type MarkdownEditorMode } from '@/components/panels/MarkdownEditor';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { api, parseMarkdownRaw, type Item } from '@/lib/api';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export function MarkdownPanel({ item }: { item: Item }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const markdownQuery = useSuspenseQuery({
    queryKey: ['markdown', item.id],
    queryFn: () => api.getMarkdown(item.id),
  });
  const md = markdownQuery.data;
  const parsed = parseMarkdownRaw(md.raw);
  const loadedBody = parsed.body ?? '';

  const [titleDraft, setTitleDraft] = useState(md.title);
  const [mode, setMode] = useState<MarkdownEditorMode>('preview');

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => api.updateMarkdown(item.id, { title: newTitle }),
    onSuccess: updated => {
      qc.setQueryData(['markdown', item.id], updated);
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
    onError,
  });

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== md.title) {
      renameMutation.mutate(trimmed);
    } else {
      setTitleDraft(md.title);
    }
  }

  const bodyEditor = useDraftEditor({
    queryKey: ['markdown', item.id, 'body'],
    loaded: loadedBody,
    save: async (body: string) => {
      const updated = await api.updateMarkdown(item.id, { body });
      qc.setQueryData(['markdown', item.id], updated);
      return body;
    },
  });

  const deleteMarkdownMutation = useMutation({
    mutationFn: () => api.deleteMarkdown(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['itemCounts', item.source_id] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      toast.add({ title: 'Markdown deleted.' });
    },
    onError,
  });

  async function onDeleteMarkdown() {
    const ok = await confirm({
      title: 'Delete this markdown?',
      description: 'The document will be removed. This cannot be undone.',
      confirmText: 'Delete markdown',
      destructive: true,
    });
    if (!ok) return;
    deleteMarkdownMutation.mutate();
  }

  const logo = TYPE_LOGO[item.type];

  const statusText =
    bodyEditor.status === 'error' && bodyEditor.error
      ? `Save failed: ${bodyEditor.error.message}`
      : bodyEditor.status === 'saving'
        ? 'Saving…'
        : bodyEditor.status === 'unsaved'
          ? 'Unsaved…'
          : bodyEditor.status === 'saved'
            ? 'Saved ✓'
            : null;

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setTitleDraft(md.title);
                  e.currentTarget.blur();
                }
              }}
              placeholder='Markdown title'
              className='min-w-0 flex-1 truncate bg-transparent font-semibold focus:outline-none'
            />
          </div>
        </div>
        <button
          type='button'
          onClick={onDeleteMarkdown}
          disabled={deleteMarkdownMutation.isPending}
          aria-label='Delete markdown'
          className='btn-sm btn-ghost'
        >
          <Trash2 />
        </button>
      </header>

      <MarkdownEditor
        value={bodyEditor.draft}
        onChange={bodyEditor.setDraft}
        mode={mode}
        setMode={setMode}
        spellCheck
        placeholder='Write your plan here. Markdown is supported.'
        statusText={statusText}
        statusError={bodyEditor.status === 'error' && !!bodyEditor.error}
        className='min-h-0 flex-1'
      />
    </aside>
  );
}
