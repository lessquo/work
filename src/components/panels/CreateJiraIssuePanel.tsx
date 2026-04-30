import { PromptPicker } from '@/components/panels/PromptPicker';
import { PromptTemplateEditor } from '@/components/panels/PromptTemplateEditor';
import { TargetRepoPicker } from '@/components/panels/TargetRepoPicker';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, DEFAULT_JIRA_PROMPT_ID, type Prompt, type PromptId } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

export function CreateJiraIssuePanel({
  sourceId,
  projectKey,
  prompts,
  onClose,
  onSessionStarted,
}: {
  sourceId: number;
  projectKey: string;
  prompts: Prompt[];
  onClose: () => void;
  onSessionStarted: (sessionId: number) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [context, setContext] = useState('');
  const [promptId, setPromptId] = useState<PromptId>(DEFAULT_JIRA_PROMPT_ID);
  const [targetRepo, setTargetRepo] = useState('');
  const effectivePromptId = prompts.some(p => p.id === promptId)
    ? promptId
    : (prompts[0]?.id ?? DEFAULT_JIRA_PROMPT_ID);
  const selectedPrompt = prompts.find(p => p.id === effectivePromptId);

  const startMutation = useMutation({
    mutationFn: () => api.startJiraDraft(sourceId, context.trim(), effectivePromptId, targetRepo),
    onSuccess: session => {
      toast.add({ title: `Jira draft session #${session.id} queued.` });
      qc.invalidateQueries({ queryKey: ['items'] });
      onSessionStarted(session.id);
    },
  });

  const canStart = context.trim().length > 0 && !startMutation.isPending;
  const error = startMutation.error instanceof Error ? startMutation.error.message : null;

  function onContextKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canStart) startMutation.mutate();
    }
  }

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='h-header flex items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <span className='font-semibold'>Create Jira issue</span>
            <span className='text-gray-500'>· {projectKey}</span>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button onClick={onClose} className='btn-sm btn-ghost' aria-label='close'>
            <X />
          </button>
        </div>
      </header>

      {error && <div className='border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700'>{error}</div>}

      <section className='border-b px-4 py-3'>
        <div className='mb-2'>
          <TargetRepoPicker value={targetRepo} onChange={setTargetRepo} allowEmpty />
        </div>
        <div className='flex gap-2'>
          <Tooltip
            content={
              targetRepo
                ? `Queue a Claude session that drafts a Jira issue — Claude can read ${targetRepo} to ground the draft`
                : 'Queue a Claude session that drafts a Jira issue from this context (no repo cloned)'
            }
          >
            <button onClick={() => startMutation.mutate()} disabled={!canStart} className='btn-sm btn-primary'>
              {startMutation.isPending ? 'Starting…' : 'Start session'}
            </button>
          </Tooltip>
        </div>
      </section>

      <section className='flex min-h-0 flex-1 flex-col bg-white'>
        <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
          <span className='text-gray-500'>What's this issue about?</span>
          <span className='text-gray-400'>⌘↵ to start</span>
        </div>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          onKeyDown={onContextKey}
          autoFocus
          spellCheck
          placeholder={
            'Describe the bug, feature, or chore. Include any relevant links, repro steps, ' +
            'affected users, deadlines, or constraints. Claude will turn this into a clean Jira draft.'
          }
          className='min-h-0 flex-1 resize-none bg-white p-4 text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400'
        />
      </section>

      <PromptPicker prompts={prompts} promptId={effectivePromptId} setPromptId={setPromptId} />

      {selectedPrompt && <PromptTemplateEditor key={selectedPrompt.id} prompt={selectedPrompt} />}
    </aside>
  );
}
