import { Markdown } from '@/components/panels/Markdown';
import { RepoPicker } from '@/components/panels/RepoPicker';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast.lib';
import { api, type Note } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useState } from 'react';
import { useParams } from 'react-router';

export function NotebookPanel() {
  const { itemId } = useParams();
  const itemIdNum = itemId ? Number(itemId) : null;
  const [, setSessionId] = useQueryState('session', parseAsInteger);
  const [sourceId] = useQueryState('source', parseAsInteger);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const notebookQuery = useSuspenseQuery({
    queryKey: itemIdNum !== null ? ['notebook', itemIdNum] : ['notebook-noop'],
    queryFn: () => (itemIdNum !== null ? api.getNotebook(itemIdNum) : Promise.resolve(null)),
  });
  const notebook = notebookQuery.data;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [context, setContext] = useState('');
  const [repo, setRepo] = useState('');

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.renameNotebook(itemIdNum!, name),
    onSuccess: () => {
      setRenaming(false);
      qc.invalidateQueries({ queryKey: ['notebook', itemIdNum] });
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
    },
    onError,
  });

  const startSessionMutation = useMutation({
    mutationFn: (vars: { context: string; repo: string }) =>
      api.startNotesSession(itemIdNum!, { context: vars.context, repo: vars.repo }),
    onSuccess: session => {
      setContext('');
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['notebook', itemIdNum] });
      setSessionId(session.id);
    },
    onError,
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: () => api.deleteNotebook(itemIdNum!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
      toast.add({ title: 'Notebook deleted.' });
    },
    onError,
  });

  if (notebook === null) {
    return <div className='flex h-full items-center justify-center text-sm text-gray-500'>No notebook selected.</div>;
  }

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

  const submitContextDisabled = startSessionMutation.isPending;

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='h-header flex items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          {renaming ? (
            <form
              className='flex items-center gap-2'
              onSubmit={e => {
                e.preventDefault();
                const v = renameValue.trim();
                if (v) renameMutation.mutate(v);
              }}
            >
              <Input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                placeholder='Notebook name'
                className='flex-1 text-sm'
              />
              <button type='submit' className='btn-sm btn-primary' disabled={renameMutation.isPending}>
                Save
              </button>
              <button type='button' className='btn-sm btn-ghost' onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className='flex items-center gap-2'>
              <h2 className='truncate text-sm font-semibold'>{notebook.name}</h2>
              <button
                className='btn-sm btn-ghost'
                aria-label='Rename'
                onClick={() => {
                  setRenameValue(notebook.name);
                  setRenaming(true);
                }}
              >
                <Pencil />
              </button>
            </div>
          )}
        </div>
        <button onClick={onDeleteNotebook} className='btn-sm btn-danger' disabled={deleteNotebookMutation.isPending}>
          <Trash2 />
          Delete
        </button>
      </header>

      <section className='border-b px-4 py-3'>
        <h3 className='mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase'>
          Start a write-notes session
        </h3>
        <div className='mb-2'>
          <RepoPicker value={repo} onChange={setRepo} allowEmpty />
        </div>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder='Describe what you want Claude to capture or revise…'
          rows={4}
          className='w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none'
        />
        <div className='mt-2 flex justify-end'>
          <button
            onClick={() => startSessionMutation.mutate({ context: context.trim(), repo: repo.trim() })}
            disabled={submitContextDisabled || context.trim().length === 0}
            className='btn-sm btn-primary'
          >
            <Play />
            {submitContextDisabled ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </section>

      <section className='flex-1 overflow-y-auto px-4 py-3'>
        <h3 className='mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase'>
          Notes ({notebook.notes.length})
        </h3>
        {notebook.notes.length === 0 ? (
          <p className='text-sm text-gray-500'>No notes yet. Start a session above to draft some.</p>
        ) : (
          <ul className='flex flex-col gap-3'>
            {notebook.notes.map(note => (
              <NoteRow key={note.id} note={note} notebookId={itemIdNum!} />
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
              <X />
              Cancel
            </button>
            <button
              className='btn-sm btn-primary'
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

export function NotebookPanelEmpty() {
  const qc = useQueryClient();
  const toast = useToast();
  const [sourceId] = useQueryState('source', parseAsInteger);

  const createMutation = useMutation({
    mutationFn: () => api.createNotebook(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
      toast.add({ title: 'Notebook created.' });
    },
    onError: e => toast.add({ title: e instanceof Error ? e.message : 'Failed.' }),
  });

  return (
    <div className='flex h-full flex-1 flex-col items-center justify-center gap-3 bg-gray-50 text-sm text-gray-500'>
      <p>No notebooks yet.</p>
      <button
        onClick={() => createMutation.mutate()}
        className='btn-md btn-primary'
        disabled={createMutation.isPending}
      >
        <Plus />
        {createMutation.isPending ? 'Creating…' : 'New notebook'}
      </button>
    </div>
  );
}
