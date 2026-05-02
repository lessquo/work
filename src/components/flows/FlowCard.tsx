import { AttachItemButton } from '@/components/AttachItemButton';
import { StatusBadge } from '@/components/items/StatusBadge';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import {
  api,
  itemCreationTime,
  type FlowSessionChild,
  type FlowWithChildren,
  type Item,
  type ItemType,
  type Note,
  type SessionStatus,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { useNumberParam } from '@/lib/router';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { FileText, Sparkles, SquarePlus, Trash2, X } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

type ItemColumn = { item: Item; sessions: FlowSessionChild[] };

export function FlowCard({ flow }: { flow: FlowWithChildren }) {
  const flowId = useNumberParam('flowId');
  const location = useLocation();
  const navigate = useNavigate();
  const wid = flow.id;
  const [openItemId] = useQueryState('item', parseAsInteger);
  const [openSessionId] = useQueryState('session', parseAsInteger);
  const [openNoteId] = useQueryState('note', parseAsInteger);
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFlow(wid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      if (flowId === wid) {
        navigate({ pathname: `/flows`, search: location.search });
      }
      toast.add({ title: 'Flow deleted', type: 'success' });
    },
    onError: e => {
      toast.add({
        title: 'Failed to delete flow',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete flow?',
      description: `Delete "${flow.name ?? `Flow #${flow.id}`}"? Attached items and sessions will be detached.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate();
  }

  const autoNameMutation = useMutation({
    mutationFn: () => api.autoNameFlow(wid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
    onError: e => {
      toast.add({
        title: 'Failed to auto-name flow',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  const autoNamedRef = useRef(false);
  const hasContext = flow.items.length > 0 || flow.sessions.length > 0;
  useEffect(() => {
    if (flow.name == null && hasContext && !autoNamedRef.current && !autoNameMutation.isPending) {
      autoNamedRef.current = true;
      autoNameMutation.mutate();
    }
  }, [flow.name, hasContext, autoNameMutation]);

  const addSessionMutation = useMutation({
    mutationFn: () => api.createDraftSession({ flowId: wid }),
    onSuccess: sess => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      const params = new URLSearchParams(location.search);
      params.set('session', String(sess.id));
      params.delete('item');
      params.set('sessionTab', 'setup');
      navigate({ pathname: `/flows/${wid}`, search: params.toString() });
    },
    onError: e => {
      toast.add({
        title: 'Failed to add session',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  const addNotebookMutation = useMutation({
    mutationFn: async (sessionIds: number[]) => {
      const item = await api.createNotebook();
      await api.setItemFlow(item.id, wid);
      await Promise.all(sessionIds.map(id => api.updateDraftSession(id, { itemId: item.id })));
      return item;
    },
    onSuccess: item => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      const params = new URLSearchParams(location.search);
      params.set('item', String(item.id));
      params.delete('session');
      params.delete('note');
      navigate({ pathname: `/flows/${wid}`, search: params.toString() });
    },
    onError: e => {
      toast.add({
        title: 'Failed to add notebook',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  const detachMutation = useMutation({
    mutationFn: (itemId: number) => api.setItemFlow(itemId, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      toast.add({ title: 'Item detached from flow', type: 'success' });
    },
    onError: e => {
      toast.add({
        title: 'Failed to detach item',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  async function handleDetach(item: Item) {
    const ok = await confirm({
      title: 'Detach item?',
      description: `Remove "${item.title}" from this flow?`,
      confirmText: 'Detach',
      destructive: true,
    });
    if (!ok) return;
    detachMutation.mutate(item.id);
  }

  function chipHref(kind: 'item' | 'session' | 'note', id: number): string {
    const params = new URLSearchParams(location.search);
    params.delete('item');
    params.delete('session');
    params.delete('note');
    params.set(kind, String(id));
    const search = params.toString();
    return `/flows/${wid}${search ? `?${search}` : ''}`;
  }

  const { columns, orphanSessions } = useMemo(() => {
    const itemIds = new Set(flow.items.map(i => i.id));
    const sessionsByItem = new Map<number, FlowSessionChild[]>();
    const orphans: FlowSessionChild[] = [];
    for (const s of flow.sessions) {
      if (s.item_id != null && itemIds.has(s.item_id)) {
        const list = sessionsByItem.get(s.item_id) ?? [];
        list.push(s);
        sessionsByItem.set(s.item_id, list);
      } else {
        orphans.push(s);
      }
    }
    for (const list of sessionsByItem.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    orphans.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const cols: ItemColumn[] = [...flow.items]
      .sort((a, b) => itemCreationTime(a).localeCompare(itemCreationTime(b)))
      .map(item => ({ item, sessions: sessionsByItem.get(item.id) ?? [] }));
    return { columns: cols, orphanSessions: orphans };
  }, [flow.items, flow.sessions]);

  const title = flow.name ?? '';

  return (
    <li className='rounded-lg border bg-white p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-baseline gap-2'>
          <h2 className='flex items-baseline gap-2 text-sm' title={title}>
            <span className='truncate font-light text-gray-500'>{flow.id}</span>
            <span className='font-medium'>{flow.name}</span>
          </h2>
          <span className='shrink-0 text-[11px] text-gray-500'>{timeAgo(flow.created_at)}</span>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <AttachItemButton flowId={wid} />
          <button
            type='button'
            onClick={() => addSessionMutation.mutate()}
            disabled={addSessionMutation.isPending}
            className='btn-sm btn-ghost flex items-center gap-1 text-[11px]'
            title='Add a draft session to configure and run'
          >
            <SquarePlus />
            {addSessionMutation.isPending ? 'Adding…' : 'Add session'}
          </button>
          <button
            type='button'
            onClick={() => autoNameMutation.mutate()}
            disabled={!hasContext || autoNameMutation.isPending}
            className='btn-sm btn-ghost flex items-center gap-1 text-[11px]'
            title='Auto-rename via Claude'
            aria-label='Auto-rename flow'
          >
            <Sparkles />
          </button>
          <button
            type='button'
            onClick={handleDelete}
            className='btn-sm btn-ghost flex items-center gap-1 text-[11px]'
            title='Delete flow'
            aria-label='Delete flow'
          >
            <Trash2 />
          </button>
        </div>
      </div>
      {columns.length === 0 && orphanSessions.length === 0 ? (
        <p className='text-xs text-gray-500'>No items or sessions.</p>
      ) : (
        <div className='flex items-start overflow-x-auto'>
          <ol className='flex items-start'>
            {[
              ...columns.map(col => ({
                key: `col-${col.item.id}`,
                item: col.item,
                head: (
                  <ItemChip
                    item={col.item}
                    to={chipHref('item', col.item.id)}
                    selected={openItemId === col.item.id}
                    onDetach={() => handleDetach(col.item)}
                  />
                ),
                sessions: col.sessions,
              })),
              ...(orphanSessions.length > 0
                ? [
                    {
                      key: 'orphans',
                      item: null as Item | null,
                      head: (
                        <PlaceholderItemChip
                          type={orphanSessions[0].source_type}
                          onCreate={
                            orphanSessions[0].source_type === 'notes'
                              ? () =>
                                  addNotebookMutation.mutate(
                                    orphanSessions.filter(s => s.status === 'draft').map(s => s.id),
                                  )
                              : undefined
                          }
                          pending={addNotebookMutation.isPending}
                        />
                      ),
                      sessions: orphanSessions,
                    },
                  ]
                : []),
            ].flatMap((col, idx) => {
              const isNotebook = col.item?.type === 'notes';
              const column = (
                <li key={col.key} className='flex shrink-0 flex-col gap-1.5'>
                  {col.head}
                  {isNotebook && col.item && (
                    <Suspense fallback={null}>
                      <NotesColumn notebookId={col.item.id} chipHref={chipHref} openNoteId={openNoteId} />
                    </Suspense>
                  )}
                  {col.sessions.length > 0 && (
                    <ol className='flex flex-col gap-1.5'>
                      {col.sessions.map(s => (
                        <SessionChip
                          key={`s-${s.id}`}
                          session={s}
                          to={chipHref('session', s.id)}
                          selected={openSessionId === s.id}
                        />
                      ))}
                    </ol>
                  )}
                </li>
              );
              if (idx === 0) return [column];
              const sep = (
                <li key={`sep-${col.key}`} aria-hidden className='mt-6 h-px w-3 shrink-0 self-start bg-gray-300' />
              );
              return [sep, column];
            })}
          </ol>
        </div>
      )}
    </li>
  );
}

function ItemChip({
  item,
  to,
  selected,
  onDetach,
}: {
  item: Item;
  to: string;
  selected?: boolean;
  onDetach: () => void;
}) {
  const logo = TYPE_LOGO[item.type];
  const title = item.title;
  return (
    <div className='group relative shrink-0'>
      <Link
        to={to}
        title={title}
        className={cn('selectable block w-44 rounded-md p-2 text-left', selected && 'selected')}
      >
        <div className='flex items-center gap-1.5'>
          <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
          <span className='truncate pr-4 text-xs font-medium text-gray-800'>{title}</span>
        </div>
        <div className='mt-1 flex items-center gap-1 text-[10px] text-gray-500'>
          <span className='truncate'>{item.key}</span>
          <StatusBadge item={item} size='sm' />
        </div>
      </Link>
      <button
        type='button'
        aria-label='Detach item from flow'
        title='Detach from flow'
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onDetach();
        }}
        className='absolute top-1 right-1 hidden rounded p-0.5 text-gray-500 group-hover:block hover:bg-gray-200 hover:text-gray-800 focus:block'
      >
        <X className='size-3' />
      </button>
    </div>
  );
}

function PlaceholderItemChip({
  type,
  onCreate,
  pending,
}: {
  type: ItemType;
  onCreate?: () => void;
  pending?: boolean;
}) {
  const logo = TYPE_LOGO[type];
  if (onCreate) {
    return (
      <button
        type='button'
        onClick={onCreate}
        disabled={pending}
        title='Create a new notebook in this flow'
        className='block w-44 shrink-0 cursor-pointer rounded-md border border-dashed border-gray-300 bg-white p-2 text-left hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'
      >
        <div className='flex items-center gap-1.5'>
          <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0 opacity-50' />
          <span className='truncate text-xs text-gray-500'>{pending ? 'Creating…' : 'New notebook'}</span>
        </div>
        <div className='mt-1 text-[10px] text-gray-400'>{logo.alt}</div>
      </button>
    );
  }
  return (
    <div
      aria-hidden
      className='block w-44 shrink-0 rounded-md border border-dashed border-gray-300 bg-white p-2 text-left'
    >
      <div className='flex items-center gap-1.5'>
        <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0 opacity-50' />
        <span className='truncate text-xs text-gray-400 italic'>No item</span>
      </div>
      <div className='mt-1 text-[10px] text-gray-400'>{logo.alt}</div>
    </div>
  );
}

function NotesColumn({
  notebookId,
  chipHref,
  openNoteId,
}: {
  notebookId: number;
  chipHref: (kind: 'item' | 'session' | 'note', id: number) => string;
  openNoteId: number | null;
}) {
  const notebookQuery = useSuspenseQuery({
    queryKey: ['notebook', notebookId],
    queryFn: () => api.getNotebook(notebookId),
  });
  const notes = notebookQuery.data.notes;
  if (notes.length === 0) return null;
  return (
    <ol className='flex flex-col gap-1.5'>
      {notes.map(n => (
        <NoteChip key={`n-${n.id}`} note={n} to={chipHref('note', n.id)} selected={openNoteId === n.id} />
      ))}
    </ol>
  );
}

function NoteChip({ note, to, selected }: { note: Note; to: string; selected?: boolean }) {
  return (
    <li className='shrink-0'>
      <Link
        to={to}
        title={`${note.title} · updated ${timeAgo(note.updated_at)}`}
        className={cn(
          'selectable flex w-44 items-center gap-1.5 rounded-md border px-2 py-1.5',
          selected && 'selected',
        )}
      >
        <FileText className='size-3 shrink-0 text-gray-500' />
        <span className='min-w-0 flex-1 truncate text-[11px] text-gray-700'>{note.title}</span>
      </Link>
    </li>
  );
}

function SessionChip({ session, to, selected }: { session: FlowSessionChild; to: string; selected?: boolean }) {
  const heading = firstLine(`#${session.id} ${session.prompt}`);
  return (
    <li className='shrink-0'>
      <Link
        to={to}
        title={`${heading} · #${session.id} · ${timeAgo(session.created_at)}`}
        className={cn(
          'selectable flex w-44 items-center gap-1.5 rounded-md border px-2 py-1.5',
          selected && 'selected',
        )}
      >
        <StatusDot status={session.status} />
        <span className='min-w-0 flex-1 truncate text-[11px] text-gray-700'>{heading}</span>
      </Link>
    </li>
  );
}

function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim().length > 0);
  return line ? line.trim().slice(0, 80) : '';
}

function StatusDot({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, string> = {
    draft: 'bg-gray-300',
    queued: 'bg-gray-400',
    running: 'bg-indigo-500',
    succeeded: 'bg-emerald-500',
    failed: 'bg-rose-500',
    aborted: 'bg-gray-400',
  };
  return <span title={status} className={cn('inline-block size-1.5 shrink-0 rounded-full', map[status])} />;
}
