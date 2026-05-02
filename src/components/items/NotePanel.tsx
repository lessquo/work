import { Markdown } from '@/components/panels/Markdown';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast.lib';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useState } from 'react';

type NotePanelMode = 'edit' | 'preview';

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

  const [mode, setMode] = useState<NotePanelMode>('edit');

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
        <button type='button' onClick={onDelete} disabled={deleteMutation.isPending} className='btn-sm btn-danger'>
          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </header>

      <div className='flex min-h-0 flex-1 flex-col bg-white'>
        <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
          <TabsRoot value={mode} onValueChange={v => setMode(v as NotePanelMode)}>
            <PillTabsList>
              <PillTabsTab value='edit' size='sm'>
                Edit
              </PillTabsTab>
              <PillTabsTab value='preview' size='sm'>
                Preview
              </PillTabsTab>
            </PillTabsList>
          </TabsRoot>
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
            value={body}
            onChange={e => setBody(e.target.value)}
            spellCheck={false}
            placeholder='Write your note in markdown…'
            className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 outline-none'
          />
        ) : (
          <div className='min-h-0 flex-1 overflow-auto bg-white p-4 text-sm text-gray-800'>
            {body.trim() ? <Markdown>{body}</Markdown> : <p className='text-gray-400'>(empty)</p>}
          </div>
        )}
      </div>
    </aside>
  );
}
