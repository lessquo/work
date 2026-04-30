import { BatchPanel } from '@/components/panels/BatchPanel';
import { CreateJiraIssuePanel } from '@/components/panels/CreateJiraIssuePanel';
import { ItemPanel } from '@/components/panels/ItemPanel';
import { NotebookPanel } from '@/components/panels/NotebookPanel';
import { SessionPanel } from '@/components/panels/SessionPanel';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { useToast } from '@/components/ui/Toast.lib';
import { api, DEFAULT_PROMPT_ID, type PromptId } from '@/lib/api';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

export function ItemsPageSlot() {
  const { itemId } = useParams();
  const itemIdNum = itemId ? Number(itemId) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [sourceId] = useQueryState('source', parseAsInteger.withDefault(0));
  const [filter] = useQueryState('filter', parseAsStringLiteral(['open', 'resolved'] as const).withDefault('open'));
  const [sort] = useQueryState('sort', parseAsStringLiteral(['recency', 'title'] as const).withDefault('recency'));
  const [selectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const [sessionId, setSessionId] = useQueryState('session', parseAsInteger);
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['logs', 'diff', 'pr', 'notes'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );
  const [jiraDraftOpen, setJiraDraftOpen] = useQueryState('jiraDraft', parseAsBoolean.withDefault(false));

  const [promptId, setPromptId] = useState<PromptId>(DEFAULT_PROMPT_ID);
  const [targetRepo, setTargetRepo] = useState('');

  const sourceQuery = useSuspenseQuery({ queryKey: ['source', sourceId], queryFn: () => api.getSource(sourceId) });
  const source = sourceQuery.data;

  const itemsQuery = useSuspenseQuery({
    queryKey: ['items', sourceId, filter, sort],
    queryFn: () => api.listItems(sourceId, filter, sort),
  });
  const items = itemsQuery.data;

  const promptsQuery = useSuspenseQuery({ queryKey: ['prompts'], queryFn: api.listPrompts });
  const prompts = promptsQuery.data;
  const effectivePromptId = prompts.some(p => p.id === promptId) ? promptId : (prompts[0]?.id ?? DEFAULT_PROMPT_ID);

  const selection = new Set<number>(selectedIds);
  if (itemIdNum !== null) selection.add(itemIdNum);

  function clearSelection() {
    const params = new URLSearchParams(window.location.search);
    params.delete('selected');
    navigate({ pathname: `/items`, search: params.toString() });
  }

  const onMutationError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : 'Failed.' });

  const sessionMutation = useMutation({
    mutationFn: (ids: number[]) => api.runItems(sourceId, ids, effectivePromptId, targetRepo),
    onSuccess: res => {
      const skippedNote = res.skipped > 0 ? ` (${res.skipped} skipped)` : '';
      toast.add({
        title:
          res.enqueued === 0
            ? 'Nothing queued.'
            : `Queued ${res.enqueued} session${res.enqueued === 1 ? '' : 's'}${skippedNote}.`,
      });
      clearSelection();
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
    },
    onError: onMutationError,
  });

  const resolveItemsMutation = useMutation({
    mutationFn: (ids: number[]) => api.resolveItems(sourceId, ids),
    onSuccess: res => {
      const parts: string[] = [`Resolved ${res.resolved} item${res.resolved === 1 ? '' : 's'}`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} error${res.errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      clearSelection();
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
    },
    onError: onMutationError,
  });

  const createFlowsMutation = useMutation({
    mutationFn: (ids: number[]) => api.createFlowsForItems(sourceId, ids),
    onSuccess: res => {
      toast.add({
        title: res.created === 0 ? 'No flows created.' : `Created ${res.created} flow${res.created === 1 ? '' : 's'}.`,
      });
      clearSelection();
      qc.invalidateQueries({ queryKey: ['flows'] });
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      navigate(`/flows`);
    },
    onError: onMutationError,
  });

  const deleteSessionsMutation = useMutation({
    mutationFn: (ids: number[]) => api.deleteItemSessions(sourceId, ids),
    onSuccess: res => {
      const parts: string[] = [`Deleted ${res.deleted} session${res.deleted === 1 ? '' : 's'}`];
      if (res.skipped_active > 0) parts.push(`${res.skipped_active} skipped (active)`);
      if (res.no_run > 0) parts.push(`${res.no_run} had no session`);
      if (res.folder_errors.length > 0)
        parts.push(`${res.folder_errors.length} folder error${res.folder_errors.length === 1 ? '' : 's'}`);
      toast.add({ title: parts.join(' · ') + '.' });
      clearSelection();
      qc.invalidateQueries({ queryKey: ['items', sourceId] });
      qc.invalidateQueries({ queryKey: ['itemCounts', sourceId] });
    },
    onError: onMutationError,
  });

  const running = sessionMutation.isPending;
  const resolving = resolveItemsMutation.isPending;
  const deletingSessions = deleteSessionsMutation.isPending;
  const creatingFlows = createFlowsMutation.isPending;

  async function runSelected() {
    if (selection.size === 0 || !targetRepo) return;
    const mode = prompts.find(p => p.id === effectivePromptId)?.label ?? effectivePromptId;
    const ok = await confirm({
      title: `Queue ${mode} sessions?`,
      description: `Claude will be queued to ${mode.toLowerCase()} ${selection.size} selected item${selection.size === 1 ? '' : 's'} against ${targetRepo}.`,
      confirmText: `Queue ${selection.size}`,
    });
    if (!ok) return;
    sessionMutation.mutate(Array.from(selection));
  }

  async function resolveSelected() {
    if (selection.size === 0) return;
    const ok = await confirm({
      title: `Resolve ${selection.size} item${selection.size === 1 ? '' : 's'}?`,
      description: 'The selected items will be marked as resolved upstream.',
      confirmText: 'Resolve',
    });
    if (!ok) return;
    resolveItemsMutation.mutate(Array.from(selection));
  }

  async function deleteSelectedSessions() {
    if (selection.size === 0) return;
    const ok = await confirm({
      title: `Delete sessions for ${selection.size} item${selection.size === 1 ? '' : 's'}?`,
      description:
        'The latest session for each selected item will be deleted along with its clone folder. Active (queued/running) sessions will be skipped.',
      confirmText: 'Delete sessions',
      destructive: true,
    });
    if (!ok) return;
    deleteSessionsMutation.mutate(Array.from(selection));
  }

  if (jiraDraftOpen) {
    return (
      <CreateJiraIssuePanel
        prompts={prompts}
        onClose={() => setJiraDraftOpen(false)}
        onSessionStarted={sessionId => {
          setJiraDraftOpen(false);
          setSessionId(sessionId);
        }}
      />
    );
  }

  if (sessionId !== null) {
    return (
      <SessionPanel
        key={sessionId}
        sessionId={sessionId}
        onClose={() => setSessionId(null)}
        tab={sessionTab}
        setTab={setSessionTab}
        descriptionMode={descriptionMode}
        setDescriptionMode={setDescriptionMode}
      />
    );
  }

  if (selection.size > 1) {
    return (
      <BatchPanel
        filter={filter}
        selectedItems={items.filter(i => selection.has(i.id))}
        prompts={prompts}
        promptId={effectivePromptId}
        setPromptId={setPromptId}
        targetRepo={targetRepo}
        setTargetRepo={setTargetRepo}
        onRun={runSelected}
        onResolve={resolveSelected}
        onDeleteSessions={deleteSelectedSessions}
        onCreateFlows={() => createFlowsMutation.mutate(Array.from(selection))}
        running={running}
        resolving={resolving}
        deletingSessions={deletingSessions}
        creatingFlows={creatingFlows}
      />
    );
  }

  if (selection.size === 1) {
    if (source.type === 'notes') return <NotebookPanel />;
    return <ItemPanel />;
  }

  return (
    <div className='flex h-full flex-1 items-center justify-center bg-gray-50 text-sm text-gray-500'>
      <p>
        {source.type === 'notes' ? (
          <>
            No notebooks yet. Click <b>New notebook</b> to create one.
          </>
        ) : (
          <>
            No items yet. Click <b>Sync</b> to fetch.
          </>
        )}
      </p>
    </div>
  );
}
