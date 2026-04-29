import { PromptPicker } from '@/components/panels/PromptPicker';
import { PromptTemplateEditor } from '@/components/panels/PromptTemplateEditor';
import { TargetRepoPicker } from '@/components/panels/TargetRepoPicker';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { parseSentryRaw, type Item, type Prompt, type PromptId } from '@/lib/api';
import { Copy, Workflow } from 'lucide-react';

type Filter = 'open' | 'resolved';

export function BatchPanel({
  filter,
  selectedItems,
  prompts,
  promptId,
  setPromptId,
  targetRepo,
  setTargetRepo,
  onRun,
  onResolve,
  onDeleteSessions,
  onCreateWorkflows,
  running,
  resolving,
  deletingSessions,
  creatingWorkflows,
}: {
  filter: Filter;
  selectedItems: Item[];
  prompts: Prompt[];
  promptId: PromptId;
  setPromptId: (p: PromptId) => void;
  targetRepo: string;
  setTargetRepo: (r: string) => void;
  onRun: () => void;
  onResolve: () => void;
  onDeleteSessions: () => void;
  onCreateWorkflows: () => void;
  running: boolean;
  resolving: boolean;
  deletingSessions: boolean;
  creatingWorkflows: boolean;
}) {
  const toast = useToast();
  const count = selectedItems.length;
  const selectedPrompt = prompts.find(p => p.id === promptId);
  const promptLabel = selectedPrompt?.label ?? 'Run';
  const promptHint = selectedPrompt?.hint ?? '';

  async function copyLinksAsMarkdown() {
    const lines = selectedItems.map(item => {
      const label =
        item.type === 'sentry_issue' ? (parseSentryRaw(item.raw).shortId ?? `#${item.id}`) : item.external_id;
      return `[${label}](${item.url})`;
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
        {filter === 'open' && (
          <div className='mb-2'>
            <TargetRepoPicker value={targetRepo} onChange={setTargetRepo} />
          </div>
        )}
        <div className='flex gap-2'>
          {filter === 'open' && (
            <>
              <Tooltip
                content={
                  targetRepo
                    ? `Queue ${promptLabel} sessions against ${targetRepo} — ${promptHint}`
                    : 'Pick a target repo first'
                }
              >
                <button onClick={onRun} disabled={running || count === 0 || !targetRepo} className='btn-sm btn-primary'>
                  {running ? 'Queuing…' : 'Run'}
                </button>
              </Tooltip>
              <Tooltip content='Mark the selected issues as resolved upstream'>
                <button onClick={onResolve} disabled={resolving || count === 0} className='btn-sm btn-secondary'>
                  {resolving ? 'Resolving…' : 'Resolve'}
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip
            content={
              count === 1
                ? 'Create a workflow with this item as a child'
                : `Create ${count} workflows, one per selected item`
            }
          >
            <button
              onClick={onCreateWorkflows}
              disabled={creatingWorkflows || count === 0}
              className='btn-sm btn-secondary'
            >
              <Workflow />
              {creatingWorkflows ? 'Creating…' : count > 1 ? `Create ${count} workflows` : 'Create workflow'}
            </button>
          </Tooltip>
          <Tooltip content='Delete the latest session for each selected issue (active sessions skipped)'>
            <button onClick={onDeleteSessions} disabled={deletingSessions || count === 0} className='btn-sm btn-danger'>
              {deletingSessions ? 'Deleting…' : 'Delete sessions'}
            </button>
          </Tooltip>
        </div>
      </section>

      <PromptPicker prompts={prompts} promptId={promptId} setPromptId={setPromptId} />

      {selectedPrompt && <PromptTemplateEditor key={selectedPrompt.id} prompt={selectedPrompt} />}
    </aside>
  );
}

