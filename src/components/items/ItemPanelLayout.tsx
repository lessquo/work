import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, type Item } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Workflow } from 'lucide-react';
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate } from 'react-router';

export function ItemPanelLayout({
  item,
  isFlowMode,
  badge,
  headerKey,
  body,
}: {
  item: Item;
  isFlowMode: boolean;
  badge?: { label: string; color: string };
  headerKey?: string;
  body: React.ReactNode;
}) {
  const [, setSelectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const [filter] = useQueryState('filter', parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'));
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  function invalidateAfterMutation() {
    setSelectedIds(null);
    qc.invalidateQueries({ queryKey: ['items', item.source_id] });
    qc.invalidateQueries({ queryKey: ['itemCounts', item.source_id] });
    if (isFlowMode) {
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['item', item.id] });
    }
  }

  const createSessionMutation = useMutation({
    mutationFn: () => api.createDraftSession({ itemId: item.id }),
    onSuccess: sess => {
      toast.add({ title: 'Created draft session.' });
      invalidateAfterMutation();
      qc.invalidateQueries({ queryKey: ['flows'] });
      if (isFlowMode) {
        const params = new URLSearchParams(window.location.search);
        params.set('session', String(sess.id));
        params.delete('item');
        params.set('sessionTab', 'setup');
        navigate({
          pathname: sess.flow_id ? `/flows/${sess.flow_id}` : window.location.pathname,
          search: params.toString(),
        });
      } else {
        navigate(`/sessions/${sess.id}?sessionTab=setup`);
      }
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveItems(item.source_id, [item.id]),
    onSuccess: res => {
      const parts: string[] = [`Resolved ${res.resolved} item${res.resolved === 1 ? '' : 's'}`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} error${res.errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      invalidateAfterMutation();
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: () => api.createFlowsForItems(item.source_id, [item.id]),
    onSuccess: res => {
      toast.add({
        title: res.created === 0 ? 'No flows created.' : `Created ${res.created} flow${res.created === 1 ? '' : 's'}.`,
      });
      invalidateAfterMutation();
      navigate(`/flows`);
    },
  });

  async function copyLink() {
    const text = `[${item.key}](${item.url})`;
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: 'Copied link.' });
    } catch (e) {
      toast.add({ title: `Copy failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function handleResolve() {
    const ok = await confirm({
      title: 'Resolve this item?',
      description: 'This item will be marked as resolved upstream.',
      confirmText: 'Resolve',
    });
    if (!ok) return;
    resolveMutation.mutate();
  }

  const logo = TYPE_LOGO[item.type];

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            {badge && (
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                  badge.color,
                )}
              >
                {badge.label}
              </span>
            )}
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='min-w-0 truncate font-semibold hover:underline'
            >
              {item.title}
            </a>
            {headerKey && <span className='shrink-0 text-xs text-gray-400'>{headerKey}</span>}
            <Tooltip content='Copy link as Markdown'>
              <button onClick={copyLink} className='btn-sm btn-ghost' aria-label='copy link'>
                <Copy />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {filter === 'open' && (
            <>
              <Tooltip content='Create a draft session — configure and run from the session panel'>
                <button
                  onClick={() => createSessionMutation.mutate()}
                  disabled={createSessionMutation.isPending}
                  className='btn-sm btn-neutral'
                >
                  {createSessionMutation.isPending ? 'Creating…' : 'Create session'}
                </button>
              </Tooltip>
              <Tooltip content='Mark this issue as resolved upstream'>
                <button onClick={handleResolve} disabled={resolveMutation.isPending} className='btn-sm btn-neutral'>
                  {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip content='Create a flow with this item as a child'>
            <button
              onClick={() => createFlowMutation.mutate()}
              disabled={createFlowMutation.isPending}
              className='btn-sm btn-neutral'
            >
              <Workflow />
              {createFlowMutation.isPending ? 'Creating…' : 'Create flow'}
            </button>
          </Tooltip>
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-auto'>{body}</div>
    </aside>
  );
}

export function FieldList({ children }: { children: React.ReactNode }) {
  return <dl className='flex flex-col gap-2 p-4'>{children}</dl>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-3'>
      <dt className='w-24 shrink-0 text-xs text-gray-500'>{label}</dt>
      <dd className='min-w-0 flex-1 text-sm text-gray-800'>{children}</dd>
    </div>
  );
}
