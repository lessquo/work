import { MarkdownEditor, type MarkdownEditorMode } from '@/components/panels/MarkdownEditor';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { api, parsePlanRaw, type Item } from '@/lib/api';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export function PlanPanel({ item }: { item: Item }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const planQuery = useSuspenseQuery({
    queryKey: ['plan', item.id],
    queryFn: () => api.getPlan(item.id),
  });
  const plan = planQuery.data;
  const parsed = parsePlanRaw(plan.raw);
  const loadedBody = parsed.body ?? '';

  const [titleDraft, setTitleDraft] = useState(plan.title);
  const [mode, setMode] = useState<MarkdownEditorMode>('preview');

  const onError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => api.updatePlan(item.id, { title: newTitle }),
    onSuccess: updated => {
      qc.setQueryData(['plan', item.id], updated);
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
    onError,
  });

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== plan.title) {
      renameMutation.mutate(trimmed);
    } else {
      setTitleDraft(plan.title);
    }
  }

  const bodyEditor = useDraftEditor({
    queryKey: ['plan', item.id, 'body'],
    loaded: loadedBody,
    save: async (body: string) => {
      const updated = await api.updatePlan(item.id, { body });
      qc.setQueryData(['plan', item.id], updated);
      return body;
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => api.deletePlan(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', item.source_id] });
      qc.invalidateQueries({ queryKey: ['itemCounts', item.source_id] });
      qc.invalidateQueries({ queryKey: ['allItems'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      toast.add({ title: 'Plan deleted.' });
    },
    onError,
  });

  async function onDeletePlan() {
    const ok = await confirm({
      title: 'Delete this plan?',
      description: 'The plan will be removed. This cannot be undone.',
      confirmText: 'Delete plan',
      destructive: true,
    });
    if (!ok) return;
    deletePlanMutation.mutate();
  }

  const logo = TYPE_LOGO[item.type];

  const statusText =
    bodyEditor.status === 'error' && bodyEditor.error
      ? `Save failed: ${bodyEditor.error.message}`
      : bodyEditor.status === 'saving'
        ? 'Saving…'
        : bodyEditor.status === 'unsaved'
          ? 'Unsaved…'
          : bodyEditor.status === 'saved'
            ? 'Saved ✓'
            : null;

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
                  setTitleDraft(plan.title);
                  e.currentTarget.blur();
                }
              }}
              placeholder='Plan title'
              className='min-w-0 flex-1 truncate bg-transparent font-semibold focus:outline-none'
            />
          </div>
        </div>
        <button
          type='button'
          onClick={onDeletePlan}
          disabled={deletePlanMutation.isPending}
          aria-label='Delete plan'
          className='btn-sm btn-ghost'
        >
          <Trash2 />
        </button>
      </header>

      <MarkdownEditor
        value={bodyEditor.draft}
        onChange={bodyEditor.setDraft}
        mode={mode}
        setMode={setMode}
        spellCheck
        placeholder='Write your plan here. Markdown is supported.'
        statusText={statusText}
        statusError={bodyEditor.status === 'error' && !!bodyEditor.error}
        className='min-h-0 flex-1'
      />
    </aside>
  );
}
