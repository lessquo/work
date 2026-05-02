import { Markdown } from '@/components/panels/Markdown';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Item, type Note } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function NotebookPanel({ item }: { item: Item }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const notebookQuery = useSuspenseQuery({
    queryKey: ['notebook', item.id],
    queryFn: () => api.getNotebook(item.id),
  });
  const notebook = notebookQuery.data;

  const [titleDraft, setTitleDraft] = useState(notebook.title);

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => api.renameNotebook(item.id, newTitle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notebook', item.id] });
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
    },
    onError,
  });

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== notebook.title) {
      renameMutation.mutate(trimmed);
    } else {
      setTitleDraft(notebook.title);
    }
  }

  const deleteNotebookMutation = useMutation({
    mutationFn: () => api.deleteNotebook(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['itemCounts', item.source_id] });
      toast.add({ title: 'Notebook deleted.' });
    },
    onError,
  });

  async function onDeleteNotebook() {
    const ok = await confirm({
      title: 'Delete this notebook?',
      description: 'All notes inside will be removed. This cannot be undone.',
      confirmText: 'Delete notebook',
      destructive: true,
    });
    if (!ok) return;
    deleteNotebookMutation.mutate();
  }

  const logo = TYPE_LOGO[item.type];

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
                  setTitleDraft(notebook.title);
                  e.currentTarget.blur();
                }
              }}
              placeholder='Notebook title'
              className='min-w-0 flex-1 truncate bg-transparent font-semibold focus:outline-none'
            />
          </div>
        </div>
        <button
          type='button'
          onClick={onDeleteNotebook}
          disabled={deleteNotebookMutation.isPending}
          className='btn-sm btn-danger'
        >
          {deleteNotebookMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </header>

      <section className='min-h-0 flex-1 overflow-auto px-4 py-3'>
        <h3 className='mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase'>
          Notes ({notebook.notes.length})
        </h3>
        {notebook.notes.length === 0 ? (
          <p className='text-sm text-gray-500'>No notes yet. Start a session above to draft some.</p>
        ) : (
          <ul className='flex flex-col gap-3'>
            {notebook.notes.map(note => (
              <NoteRow key={note.id} note={note} notebookId={item.id} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function NoteRow({ note, notebookId }: { note: Note; notebookId: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_md);

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const saveMutation = useMutation({
    mutationFn: () => api.updateNote(note.id, { title, body_md: body }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['notebook', notebookId] });
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteNote(note.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notebook', notebookId] });
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
    <li className='rounded-md border border-gray-200 bg-white p-3'>
      {editing ? (
        <div className='flex flex-col gap-2'>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='Title'
            className='text-sm font-medium'
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            className='w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none'
          />
          <div className='flex justify-end gap-2'>
            <button
              className='btn-sm btn-ghost'
              onClick={() => {
                setTitle(note.title);
                setBody(note.body_md);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              className='btn-sm btn-neutral'
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className='flex items-center justify-between gap-2'>
            <h4 className='truncate text-sm font-semibold'>{note.title}</h4>
            <div className='flex items-center gap-1'>
              <span className='text-[11px] text-gray-400'>updated {timeAgo(note.updated_at)}</span>
              <button className='btn-sm btn-ghost' aria-label='Edit' onClick={() => setEditing(true)}>
                <Pencil />
              </button>
              <button
                className='btn-sm btn-ghost text-rose-600'
                aria-label='Delete'
                onClick={onDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 />
              </button>
            </div>
          </div>
          <div className='prose prose-sm mt-2 max-w-none text-sm text-gray-700'>
            <Markdown>{note.body_md}</Markdown>
          </div>
        </>
      )}
    </li>
  );
}
