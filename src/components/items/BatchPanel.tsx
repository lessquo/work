import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { type Item } from '@/lib/api';
import { Copy, Workflow } from 'lucide-react';

type Filter = 'open' | 'resolved';

export function BatchPanel({
  filter,
  selectedItems,
  onCreateSessions,
  onResolve,
  onCreateFlows,
  creatingSessions,
  resolving,
  creatingFlows,
}: {
  filter: Filter;
  selectedItems: Item[];
  onCreateSessions: () => void;
  onResolve: () => void;
  onCreateFlows: () => void;
  creatingSessions: boolean;
  resolving: boolean;
  creatingFlows: boolean;
}) {
  const toast = useToast();
  const count = selectedItems.length;

  async function copyLinksAsMarkdown() {
    const lines = selectedItems.map(item => {
      return `[${item.key}](${item.url})`;
    });
    const text = lines.length === 1 ? lines[0] : lines.map(l => `- ${l}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: count === 1 ? 'Copied link.' : `Copied ${count} links.` });
    } catch (e) {
      toast.add({ title: `Copy failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='h-header flex items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <span className='font-semibold'>
              {count} item{count === 1 ? '' : 's'} selected
            </span>
            <Tooltip content={count === 1 ? 'Copy link as Markdown' : `Copy ${count} links as Markdown`}>
              <button onClick={copyLinksAsMarkdown} className='btn-sm btn-ghost' aria-label='copy links'>
                <Copy />
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      <section className='border-b px-4 py-3'>
        <div className='flex gap-2'>
          {filter === 'open' && (
            <>
              <Tooltip content='Create a draft session per selected item — configure and run from the session panel'>
                <button
                  onClick={onCreateSessions}
                  disabled={creatingSessions || count === 0}
                  className='btn-sm btn-neutral'
                >
                  {creatingSessions ? 'Creating…' : `Create ${count} sessions`}
                </button>
              </Tooltip>
              <Tooltip content='Mark the selected issues as resolved upstream'>
                <button onClick={onResolve} disabled={resolving || count === 0} className='btn-sm btn-neutral'>
                  {resolving ? 'Resolving…' : 'Resolve'}
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip
            content={
              count === 1 ? 'Create a flow with this item as a child' : `Create ${count} flows, one per selected item`
            }
          >
            <button onClick={onCreateFlows} disabled={creatingFlows || count === 0} className='btn-sm btn-neutral'>
              <Workflow />
              {creatingFlows ? 'Creating…' : count > 1 ? `Create ${count} flows` : 'Create flow'}
            </button>
          </Tooltip>
        </div>
      </section>
    </aside>
  );
}
