import { DiffView } from '@/components/panels/DiffView';
import { LogsView } from '@/components/panels/LogsView';
import { Markdown } from '@/components/panels/Markdown';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { PillTabsList, PillTabsTab, TabsList, TabsPanel, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, type Session } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

export type SessionPanelTab = 'logs' | 'diff' | 'pr';
export type DescriptionMode = 'edit' | 'preview';

export function SessionPanel({
  sessionId,
  onClose,
  tab,
  setTab,
  descriptionMode,
  setDescriptionMode,
}: {
  sessionId: number;
  onClose: () => void;
  tab: SessionPanelTab;
  setTab: (t: SessionPanelTab) => void;
  descriptionMode: DescriptionMode;
  setDescriptionMode: (m: DescriptionMode) => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  async function copyClonePath() {
    if (!session?.clone_path) return;
    try {
      await navigator.clipboard.writeText(session.clone_path);
      toast.add({ title: 'Copied clone path.' });
    } catch (e) {
      toast.add({ title: `Copy failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const [logs, setLogs] = useState('');
  const [followupDraft, setFollowupDraft] = useState('');
  const [streamEpoch, setStreamEpoch] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const sessionQuery = useSuspenseQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
  });
  const session = sessionQuery.data;

  const createPrMutation = useMutation({
    mutationFn: () => api.createGithubPr(sessionId),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['itemCounts'] });
      if (updated.source_id) qc.invalidateQueries({ queryKey: ['source', updated.source_id, 'workflows'] });
    },
  });

  const createJiraMutation = useMutation({
    mutationFn: () => api.createJiraIssue(sessionId),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['itemCounts'] });
      if (updated.source_id) qc.invalidateQueries({ queryKey: ['source', updated.source_id, 'workflows'] });
    },
  });

  const abortMutation = useMutation({
    mutationFn: () => api.abortSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const followupMutation = useMutation({
    mutationFn: (message: string) => api.followupSession(sessionId, message),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      setFollowupDraft('');
      setLogs('');
      setStreamEpoch(e => e + 1);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSession(sessionId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['session', sessionId] });
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
  });

  useEffect(() => {
    const es = new EventSource(`/api/sessions/${sessionId}/log`);
    es.addEventListener('log', (e: MessageEvent) => {
      setLogs(prev => prev + e.data);
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
    });
    es.addEventListener('end', () => {
      es.close();
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [sessionId, streamEpoch, qc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = session?.status === 'queued' || session?.status === 'running';
  const isJira = session?.type === 'jira_issue';
  const prError =
    (createPrMutation.error instanceof Error ? createPrMutation.error.message : null) ??
    (createJiraMutation.error instanceof Error ? createJiraMutation.error.message : null) ??
    (deleteMutation.error instanceof Error ? deleteMutation.error.message : null) ??
    (followupMutation.error instanceof Error ? followupMutation.error.message : null);

  function sendFollowup() {
    const msg = followupDraft.trim();
    if (!msg) return;
    followupMutation.mutate(msg);
  }

  return (
    <aside className='flex h-full flex-col border-l bg-white'>
      <header className='flex h-12 items-center gap-2 border-b bg-gray-50 px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-sm'>
            <span className='font-semibold'>Session #{sessionId}</span>
            {session && <StatusBadge status={session.status} />}
            {session?.clone_path && (
              <Tooltip content={`Copy clone path — ${session.clone_path}`}>
                <button onClick={copyClonePath} className='btn-sm btn-ghost' aria-label='copy clone path'>
                  <Copy />
                </button>
              </Tooltip>
            )}
          </div>
          {session?.error && <div className='mt-0.5 truncate text-xs text-rose-600'>{session.error}</div>}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {session?.pr_url && (
            <a href={session.pr_url} target='_blank' rel='noreferrer' className='btn-sm btn-success'>
              {isJira ? 'View Jira issue ↗' : 'View PR ↗'}
            </a>
          )}
          {session?.status === 'succeeded' &&
            (isJira ? (
              !session.pr_url && (
                <button
                  disabled={createJiraMutation.isPending}
                  onClick={() => createJiraMutation.mutate()}
                  className='btn-sm btn-primary'
                >
                  {createJiraMutation.isPending ? 'Creating issue…' : 'Create Jira issue'}
                </button>
              )
            ) : (
              <button
                disabled={createPrMutation.isPending}
                onClick={() => createPrMutation.mutate()}
                className='btn-sm btn-primary'
              >
                {createPrMutation.isPending
                  ? session.pr_url
                    ? 'Pushing…'
                    : 'Creating PR…'
                  : session.pr_url
                    ? 'Commit & push'
                    : 'Create PR'}
              </button>
            ))}
          {active ? (
            <button
              onClick={() => abortMutation.mutate()}
              disabled={abortMutation.isPending}
              className='btn-sm btn-danger'
            >
              Abort
            </button>
          ) : (
            <Tooltip content='Delete this session record and its clone folder'>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete this session?',
                    description: 'The session record and its clone folder will be permanently deleted.',
                    confirmText: 'Delete',
                    destructive: true,
                  });
                  if (!ok) return;
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
                className='btn-sm btn-danger'
              >
                Delete
              </button>
            </Tooltip>
          )}
          <button onClick={onClose} className='btn-sm btn-ghost' aria-label='close'>
            <X />
          </button>
        </div>
      </header>
      {prError && <div className='border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700'>{prError}</div>}

      <TabsRoot
        value={isJira && tab === 'diff' ? 'pr' : tab}
        onValueChange={v => setTab(v as SessionPanelTab)}
        className='flex min-h-0 flex-1 flex-col'
      >
        <TabsList className='border-b'>
          <TabsTab value='logs'>Logs</TabsTab>
          {!isJira && <TabsTab value='diff'>Diff</TabsTab>}
          <TabsTab value='pr'>{isJira ? 'Ticket' : 'PR'}</TabsTab>
        </TabsList>
        <TabsPanel value='logs' keepMounted={false} className='min-h-0 flex-1 overflow-hidden'>
          <div ref={logRef} className='h-full overflow-auto bg-white p-4 font-mono text-xs text-gray-800'>
            {logs ? (
              <LogsView text={logs} />
            ) : (
              <span className='text-gray-500'>{active ? 'Waiting for output…' : '(no output)'}</span>
            )}
          </div>
        </TabsPanel>
        {!isJira && (
          <TabsPanel value='diff' keepMounted={false} className='min-h-0 flex-1 overflow-hidden'>
            <div className='h-full overflow-auto bg-white p-4'>
              <Suspense fallback={<p className='text-sm text-gray-500'>Loading diff…</p>}>
                <DiffView sessionId={sessionId} />
              </Suspense>
            </div>
          </TabsPanel>
        )}
        <TabsPanel value='pr' keepMounted={false} className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='h-40 shrink-0 border-b'>
            <TitleEditor sessionId={sessionId} session={session} isJira={isJira} />
          </div>
          <div className='min-h-0 flex-1'>
            <DescriptionEditor
              sessionId={sessionId}
              session={session}
              isJira={isJira}
              mode={descriptionMode}
              setMode={setDescriptionMode}
            />
          </div>
        </TabsPanel>
      </TabsRoot>
      <FollowupComposer
        session={session}
        draft={followupDraft}
        setDraft={setFollowupDraft}
        onSend={sendFollowup}
        pending={followupMutation.isPending}
      />
    </aside>
  );
}

function TitleEditor({ sessionId, session, isJira }: { sessionId: number; session: Session | null; isJira: boolean }) {
  const queryKey = ['session', sessionId, 'commit-message'] as const;
  const locked = isJira && !!session?.pr_url;
  const noClone = !session?.clone_path;
  const active = session?.status === 'queued' || session?.status === 'running';
  const disabled = locked || noClone || active;

  const msgQuery = useQuery({
    queryKey,
    queryFn: () => api.getSessionCommitMessage(sessionId),
    enabled: !active && !noClone,
  });

  const { draft, setDraft, status, error } = useDraftEditor({
    queryKey,
    loaded: msgQuery.data,
    save: (content: string) => api.updateSessionCommitMessage(sessionId, content),
    disabled,
  });

  const firstLine = draft.split('\n')[0] ?? '';
  const limit = isJira ? 120 : 72;
  const overLimit = firstLine.length > limit;
  const lockedLabel = isJira ? 'Jira issue created — locked' : 'PR created — locked';
  const noClonePathLabel = isJira ? 'No workspace path' : 'No clone path';
  const placeholder = isJira ? 'Concise Jira issue summary' : 'fix(area): short subject line';
  const hint = isJira ? 'Jira issue summary' : 'First line is the commit subject';

  return (
    <div className='flex h-full flex-col bg-white'>
      <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
        <div className='text-gray-500'>
          {hint}{' '}
          <span className={cn(overLimit ? 'font-medium text-rose-600' : 'text-gray-400')}>
            ({firstLine.length}/{limit})
          </span>
        </div>
        <span className='shrink-0'>
          {status === 'error' && error ? (
            <span className='text-rose-600'>Save failed: {error.message}</span>
          ) : status === 'saving' ? (
            <span className='text-gray-500'>Saving…</span>
          ) : status === 'unsaved' ? (
            <span className='text-gray-500'>Unsaved…</span>
          ) : status === 'saved' ? (
            <span className='text-emerald-600'>Saved ✓</span>
          ) : locked ? (
            <span className='text-gray-500'>{lockedLabel}</span>
          ) : active ? (
            <span className='text-gray-500'>Working — wait for the turn to finish</span>
          ) : noClone ? (
            <span className='text-gray-500'>{noClonePathLabel}</span>
          ) : null}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={disabled}
        spellCheck
        placeholder={placeholder}
        className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 outline-none disabled:bg-gray-50 disabled:text-gray-500'
      />
    </div>
  );
}

function FollowupComposer({
  session,
  draft,
  setDraft,
  onSend,
  pending,
}: {
  session: Session | null;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  pending: boolean;
}) {
  if (!session) return null;
  if (!session.claude_session_id) return null;
  const active = session.status === 'queued' || session.status === 'running';
  const canSend = !active && !pending && draft.trim().length > 0;

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className='border-t bg-gray-50 p-2'>
      <div className='flex items-end gap-2'>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder={active ? 'Working — wait for this turn to finish…' : 'Ask a follow-up · ⌘↵ to send'}
          disabled={active || pending}
          className='min-h-0 flex-1 resize-none rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500'
        />
        <Tooltip content='Continue this session with a follow-up turn'>
          <button onClick={onSend} disabled={!canSend} className='btn-sm btn-primary'>
            {pending ? 'Sending…' : 'Send'}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function DescriptionEditor({
  sessionId,
  session,
  isJira,
  mode,
  setMode,
}: {
  sessionId: number;
  session: Session | null;
  isJira: boolean;
  mode: DescriptionMode;
  setMode: (m: DescriptionMode) => void;
}) {
  const queryKey = ['session', sessionId, 'pr-body'] as const;
  const locked = isJira && !!session?.pr_url;
  const noClone = !session?.clone_path;
  const active = session?.status === 'queued' || session?.status === 'running';
  const disabled = locked || noClone || active;

  const bodyQuery = useQuery({
    queryKey,
    queryFn: () => api.getSessionPrBody(sessionId),
    enabled: !active && !noClone,
  });

  const { draft, setDraft, status, error } = useDraftEditor({
    queryKey,
    loaded: bodyQuery.data,
    save: (content: string) => api.updateSessionPrBody(sessionId, content),
    disabled,
  });

  return (
    <div className='flex h-full flex-col bg-white'>
      <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
        <TabsRoot value={mode} onValueChange={v => setMode(v as DescriptionMode)}>
          <PillTabsList>
            <PillTabsTab value='preview' size='sm'>
              Preview
            </PillTabsTab>
            <PillTabsTab value='edit' size='sm'>
              Edit
            </PillTabsTab>
          </PillTabsList>
        </TabsRoot>
        <span className='shrink-0'>
          {status === 'error' && error ? (
            <span className='text-rose-600'>Save failed: {error.message}</span>
          ) : status === 'saving' ? (
            <span className='text-gray-500'>Saving…</span>
          ) : status === 'unsaved' ? (
            <span className='text-gray-500'>Unsaved…</span>
          ) : status === 'saved' ? (
            <span className='text-emerald-600'>Saved ✓</span>
          ) : locked ? (
            <span className='text-gray-500'>{isJira ? 'Jira issue created — locked' : 'PR created — locked'}</span>
          ) : active ? (
            <span className='text-gray-500'>Working — wait for the turn to finish</span>
          ) : noClone ? (
            <span className='text-gray-500'>{isJira ? 'No workspace path' : 'No clone path'}</span>
          ) : null}
        </span>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={disabled}
          spellCheck
          placeholder={isJira ? '### Context\n\n…' : '## Summary\n\n…'}
          className='min-h-0 flex-1 resize-none bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 outline-none disabled:bg-gray-50 disabled:text-gray-500'
        />
      ) : (
        <div className='min-h-0 flex-1 overflow-auto bg-white p-4 text-sm text-gray-800'>
          {draft.trim() ? <Markdown>{draft}</Markdown> : <p className='text-gray-400'>(empty)</p>}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const map: Record<Session['status'], string> = {
    queued: 'status-secondary',
    running: 'status-primary',
    succeeded: 'status-success',
    failed: 'status-danger',
    aborted: 'status-secondary',
  };
  return <span className={cn('chip-sm', map[status])}>{status}</span>;
}
