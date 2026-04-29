import { AttachItemDialog } from '@/components/AttachItemDialog';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import {
  api,
  itemCreationTime,
  itemTitle,
  type Item,
  type SessionStatus,
  type WorkflowSessionChild,
  type WorkflowWithChildren,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

type ItemChild = { kind: 'item'; at: string; item: Item };
type SessionChild = { kind: 'session'; at: string; session: WorkflowSessionChild };
type Child = ItemChild | SessionChild;

export function WorkflowCard({ workflow }: { workflow: WorkflowWithChildren }) {
  const { sourceId, workflowId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wid = workflow.id;
  const [openItemId] = useQueryState('item', parseAsInteger);
  const [openSessionId] = useQueryState('session', parseAsInteger);
  const [attachOpen, setAttachOpen] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWorkflow(wid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      if (sourceId) qc.invalidateQueries({ queryKey: ['items', Number(sourceId)] });
      if (workflowId && Number(workflowId) === wid) {
        navigate({ pathname: `/sources/${sourceId}/workflows`, search: location.search });
      }
      toast.add({ title: 'Workflow deleted', type: 'success' });
    },
    onError: e => {
      toast.add({
        title: 'Failed to delete workflow',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete workflow?',
      description: `Delete "${workflow.name ?? `Workflow #${workflow.id}`}"? Attached items and sessions will be detached.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate();
  }

  const detachMutation = useMutation({
    mutationFn: (itemId: number) => api.setItemWorkflow(itemId, null),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: q => q.queryKey[0] === 'source' && q.queryKey[2] === 'workflows',
      });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      if (sourceId) qc.invalidateQueries({ queryKey: ['items', Number(sourceId)] });
      toast.add({ title: 'Item detached from workflow', type: 'success' });
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
      description: `Remove "${itemTitle(item)}" from this workflow?`,
      confirmText: 'Detach',
      destructive: true,
    });
    if (!ok) return;
    detachMutation.mutate(item.id);
  }

  function chipHref(kind: 'item' | 'session', id: number): string {
    const params = new URLSearchParams(location.search);
    if (kind === 'item') {
      params.set('item', String(id));
      params.delete('session');
    } else {
      params.set('session', String(id));
      params.delete('item');
    }
    const search = params.toString();
    return `/sources/${sourceId}/workflows/${wid}${search ? `?${search}` : ''}`;
  }

  const children = useMemo<Child[]>(() => {
    const items: Child[] = workflow.items.map(item => ({ kind: 'item', at: itemCreationTime(item), item }));
    const sessions: Child[] = workflow.sessions.map(session => ({
      kind: 'session',
      at: session.created_at,
      session,
    }));
    return [...items, ...sessions].sort((a, b) => a.at.localeCompare(b.at));
  }, [workflow.items, workflow.sessions]);

  const title = workflow.name ?? `Workflow #${workflow.id}`;

  return (
    <li className='rounded-lg border bg-white p-3'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-baseline gap-2'>
          <h2 className='truncate text-sm font-medium' title={title}>
            {title}
          </h2>
          <span className='shrink-0 text-[11px] text-gray-500'>{timeAgo(workflow.created_at)}</span>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            onClick={() => setAttachOpen(true)}
            className='btn-sm btn-ghost flex items-center gap-1 text-[11px]'
            title='Attach item'
          >
            <Plus />
            Add item
          </button>
          <button
            type='button'
            onClick={handleDelete}
            className='btn-sm btn-ghost flex items-center gap-1 text-[11px]'
            title='Delete workflow'
            aria-label='Delete workflow'
          >
            <Trash2 />
          </button>
        </div>
      </div>
      {children.length === 0 ? (
        <p className='text-xs text-gray-500'>No items or sessions.</p>
      ) : (
        <ol className='flex overflow-x-auto'>
          {children.flatMap((child, idx) => {
            const chip =
              child.kind === 'item' ? (
                <ItemChip
                  key={`i-${child.item.id}`}
                  item={child.item}
                  at={child.at}
                  to={chipHref('item', child.item.id)}
                  selected={openItemId === child.item.id}
                  onDetach={() => handleDetach(child.item)}
                />
              ) : (
                <SessionChip
                  key={`s-${child.session.id}`}
                  session={child.session}
                  at={child.at}
                  to={chipHref('session', child.session.id)}
                  selected={openSessionId === child.session.id}
                />
              );
            if (idx === 0) return [chip];
            const sep = <li key={`sep-${idx}`} aria-hidden className='h-px w-3 shrink-0 self-center bg-gray-300' />;
            return [sep, chip];
          })}
        </ol>
      )}
      {sourceId && (
        <AttachItemDialog open={attachOpen} onOpenChange={setAttachOpen} workflowId={wid} sourceId={Number(sourceId)} />
      )}
    </li>
  );
}

function ItemChip({
  item,
  at,
  to,
  selected,
  onDetach,
}: {
  item: Item;
  at: string;
  to: string;
  selected?: boolean;
  onDetach: () => void;
}) {
  const logo = TYPE_LOGO[item.type];
  const title = itemTitle(item);
  return (
    <li className='group relative shrink-0'>
      <Link
        to={to}
        title={title}
        className={cn(
          'block w-44 rounded-md border p-2 text-left',
          selected ? 'selected-primary' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100',
        )}
      >
        <div className='flex items-center gap-1.5'>
          <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
          <span className='truncate pr-4 text-xs font-medium text-gray-800'>{title}</span>
        </div>
        <div className='mt-1 flex items-center gap-1 text-[10px] text-gray-500'>
          <span className='truncate'>{item.external_id}</span>
          <span>·</span>
          <span className='shrink-0'>{timeAgo(at)}</span>
        </div>
      </Link>
      <button
        type='button'
        aria-label='Detach item from workflow'
        title='Detach from workflow'
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onDetach();
        }}
        className='absolute top-1 right-1 hidden rounded p-0.5 text-gray-500 group-hover:block hover:bg-gray-200 hover:text-gray-800 focus:block'
      >
        <X className='size-3' />
      </button>
    </li>
  );
}

function SessionChip({
  session,
  at,
  to,
  selected,
}: {
  session: WorkflowSessionChild;
  at: string;
  to: string;
  selected?: boolean;
}) {
  const itemLogo = session.item_type ? TYPE_LOGO[session.item_type] : null;
  const heading =
    session.item_external_id && session.item_type && session.item_raw
      ? itemTitle({ type: session.item_type, raw: session.item_raw, external_id: session.item_external_id })
      : firstLine(session.user_context) || `Session #${session.id}`;
  return (
    <li className='shrink-0'>
      <Link
        to={to}
        title={heading}
        className={cn(
          'block w-44 rounded-md border p-2 text-left',
          selected ? 'selected-primary' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50',
        )}
      >
        <div className='flex items-center gap-1.5'>
          <TypeBadge type={session.type} />
          <StatusDot status={session.status} />
          {itemLogo && <img src={itemLogo.src} alt={itemLogo.alt} className='size-3 shrink-0' />}
          <span className='truncate text-xs font-medium text-gray-800'>{heading}</span>
        </div>
        <div className='mt-1 flex items-center gap-1 text-[10px] text-gray-500'>
          <span className='truncate'>#{session.id}</span>
          <span>·</span>
          <span className='shrink-0'>{timeAgo(at)}</span>
        </div>
      </Link>
    </li>
  );
}

function firstLine(text: string | null): string | null {
  if (!text) return null;
  const line = text.split('\n').find(l => l.trim().length > 0);
  return line ? line.trim().slice(0, 80) : null;
}

function TypeBadge({ type }: { type: WorkflowSessionChild['type'] }) {
  const map = {
    github_pr: 'border-sky-300 bg-sky-50 text-sky-700',
    jira_issue: 'border-violet-300 bg-violet-50 text-violet-700',
    sentry_issue: 'border-amber-300 bg-amber-50 text-amber-700',
  } as const;
  const label = type === 'github_pr' ? 'PR' : type === 'jira_issue' ? 'Jira' : 'Sentry';
  return (
    <span className={cn('rounded border px-1 py-0 text-[9px] font-semibold tracking-wide uppercase', map[type])}>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, string> = {
    queued: 'bg-gray-400',
    running: 'bg-indigo-500',
    succeeded: 'bg-emerald-500',
    failed: 'bg-rose-500',
    aborted: 'bg-gray-400',
  };
  return <span title={status} className={cn('inline-block size-1.5 shrink-0 rounded-full', map[status])} />;
}
