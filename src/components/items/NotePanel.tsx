import { MarkdownEditor, type MarkdownEditorMode } from '@/components/panels/MarkdownEditor';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { FileText, Trash2 } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useState } from 'react';

export function NotePanel({ noteId }: { noteId: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [, setNoteParam] = useQueryState('note', parseAsInteger);

  const noteQuery = useSuspenseQuery({
    queryKey: ['note', noteId],
    queryFn: () => api.getNote(noteId),
  });
  const note = noteQuery.data;

  const [titleDraft, setTitleDraft] = useState(note.title);

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => api.updateNote(noteId, { title: newTitle }),
    onSuccess: updated => {
      qc.setQueryData(['note', noteId], updated);
      qc.invalidateQueries({ queryKey: ['notebook', updated.item_id] });
    },
    onError,
  });

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== note.title) {
      renameMutation.mutate(trimmed);
    } else {
      setTitleDraft(note.title);
    }
  }

  const {
    draft: body,
    setDraft: setBody,
    status,
    error,
  } = useDraftEditor({
    queryKey: ['note', noteId, 'body-draft'],
    loaded: note.body_md,
    save: async (content: string) => {
      const updated = await api.updateNote(noteId, { body_md: content });
      qc.setQueryData(['note', noteId], updated);
      qc.invalidateQueries({ queryKey: ['notebook', updated.item_id] });
    },
  });

  const [mode, setMode] = useState<MarkdownEditorMode>('preview');

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteNote(noteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notebook', note.item_id] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      void setNoteParam(null);
      toast.add({ title: 'Note deleted.' });
    },
    onError,
  });

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete this note?',
      description: `"${note.title}" will be removed.`,
      confirmText: 'Delete note',
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate();
  }

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <FileText className='size-3.5 shrink-0 text-gray-500' />
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setTitleDraft(note.title);
                  e.currentTarget.blur();
                }
              }}
              placeholder='Note title'
              className='min-w-0 flex-1 truncate bg-transparent font-semibold focus:outline-none'
            />
            <span className='shrink-0 text-xs text-gray-400'>updated {timeAgo(note.updated_at)}</span>
          </div>
        </div>
        <button
          type='button'
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          aria-label='Delete note'
          className='btn-sm btn-ghost'
        >
          <Trash2 />
        </button>
      </header>

      <MarkdownEditor
        value={body}
        onChange={setBody}
        mode={mode}
        setMode={setMode}
        placeholder='Write your note in markdown…'
        statusText={
          status === 'error' && error
            ? `Save failed: ${error.message}`
            : status === 'saving'
              ? 'Saving…'
              : status === 'unsaved'
                ? 'Unsaved…'
                : status === 'saved'
                  ? 'Saved ✓'
                  : null
        }
        statusError={status === 'error' && !!error}
        className='min-h-0 flex-1'
      />
    </aside>
  );
}
