import { InsertNoteButton } from '@/components/InsertNoteButton';
import { DiffView } from '@/components/panels/DiffView';
import { LogsView } from '@/components/panels/LogsView';
import { Markdown } from '@/components/panels/Markdown';
import { PromptPicker } from '@/components/panels/PromptPicker';
import { PromptTemplateEditor } from '@/components/panels/PromptTemplateEditor';
import { TargetRepoPicker } from '@/components/panels/TargetRepoPicker';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Select, type SelectOption } from '@/components/ui/Select';
import { PillTabsList, PillTabsTab, TabsList, TabsPanel, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, DEFAULT_PROMPT_ID, type Prompt, type PromptId, type Session, type Source } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDraftEditor } from '@/lib/useDraftEditor';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Copy, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

export type SessionPanelTab = 'setup' | 'logs' | 'diff' | 'pr' | 'notes';
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
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const createJiraMutation = useMutation({
    mutationFn: () => api.createJiraIssue(sessionId),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['itemCounts'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const updateJiraMutation = useMutation({
    mutationFn: () => api.updateJiraIssue(sessionId),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
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

  const queueMutation = useMutation({
    mutationFn: () => api.queueDraftSession(sessionId),
    onSuccess: updated => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['itemCounts'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      setLogs('');
      setStreamEpoch(e => e + 1);
      setTab('logs');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSession(sessionId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['session', sessionId] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['flows'] });
      onClose();
    },
  });

  const isDraft = session?.status === 'draft';

  useEffect(() => {
    if (isDraft) return;
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
  }, [sessionId, streamEpoch, qc, isDraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = session?.status === 'queued' || session?.status === 'running';
  const isJira = session?.source_type === 'jira_issue';
  const isNotes = session?.source_type === 'notes';
  const canRun = isDraft && (isJira || isNotes || !!session?.target_repo);
  const prError =
    (createPrMutation.error instanceof Error ? createPrMutation.error.message : null) ??
    (createJiraMutation.error instanceof Error ? createJiraMutation.error.message : null) ??
    (updateJiraMutation.error instanceof Error ? updateJiraMutation.error.message : null) ??
    (deleteMutation.error instanceof Error ? deleteMutation.error.message : null) ??
    (followupMutation.error instanceof Error ? followupMutation.error.message : null) ??
    (queueMutation.error instanceof Error ? queueMutation.error.message : null);

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
          {isDraft && (
            <Tooltip content={canRun ? 'Queue this session' : 'Pick a target repo first'}>
              <button
                onClick={() => queueMutation.mutate()}
                disabled={!canRun || queueMutation.isPending}
                className='btn-sm btn-primary'
              >
                {queueMutation.isPending ? 'Queuing…' : 'Run'}
              </button>
            </Tooltip>
          )}
          {session?.status === 'succeeded' &&
            !isNotes &&
            (isJira ? (
              session.pr_url ? (
                <button
                  disabled={updateJiraMutation.isPending}
                  onClick={() => updateJiraMutation.mutate()}
                  className='btn-sm btn-primary'
                >
                  {updateJiraMutation.isPending ? 'Updating issue…' : 'Update Jira issue'}
                </button>
              ) : (
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
            <Tooltip
              content={isDraft ? 'Discard this draft session' : 'Delete this session record and its clone folder'}
            >
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: isDraft ? 'Discard this draft?' : 'Delete this session?',
                    description: isDraft
                      ? 'The draft session will be discarded.'
                      : 'The session record and its clone folder will be permanently deleted.',
                    confirmText: isDraft ? 'Discard' : 'Delete',
                    destructive: true,
                  });
                  if (!ok) return;
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
                className='btn-sm btn-danger'
              >
                {isDraft ? 'Discard' : 'Delete'}
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
        value={resolveTabValue(tab, { isJira, isNotes, isDraft })}
        onValueChange={v => setTab(v as SessionPanelTab)}
        className='flex min-h-0 flex-1 flex-col'
      >
        <TabsList className='border-b'>
          <TabsTab value='setup'>Setup</TabsTab>
          {!isDraft && (
            <>
              <TabsTab value='logs'>Logs</TabsTab>
              {isNotes ? (
                <TabsTab value='notes'>Notes</TabsTab>
              ) : (
                <>
                  {!isJira && <TabsTab value='diff'>Diff</TabsTab>}
                  <TabsTab value='pr'>{isJira ? 'Ticket' : 'PR'}</TabsTab>
                </>
              )}
            </>
          )}
        </TabsList>
        <TabsPanel value='setup' keepMounted={false} className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <Suspense fallback={<p className='p-4 text-sm text-gray-500'>Loading prompts…</p>}>
            <SetupTab session={session} />
          </Suspense>
        </TabsPanel>
        {!isDraft && (
          <>
            <TabsPanel value='logs' keepMounted={false} className='min-h-0 flex-1 overflow-hidden'>
              <div ref={logRef} className='h-full overflow-auto bg-white p-4 font-mono text-xs text-gray-800'>
                {logs ? (
                  <LogsView text={logs} />
                ) : (
                  <span className='text-gray-500'>{active ? 'Waiting for output…' : '(no output)'}</span>
                )}
              </div>
            </TabsPanel>
            {isNotes ? (
              <TabsPanel value='notes' keepMounted={false} className='min-h-0 flex-1 overflow-hidden'>
                <NotesView session={session} />
              </TabsPanel>
            ) : (
              <>
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
              </>
            )}
          </>
        )}
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

function SetupTab({ session }: { session: Session | null }) {
  const qc = useQueryClient();
  const promptsQuery = useSuspenseQuery({ queryKey: ['prompts'], queryFn: api.listPrompts });
  const prompts = promptsQuery.data;
  const sourcesQuery = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const sources = sourcesQuery.data ?? [];

  const isDraft = session?.status === 'draft';
  const isJira = session?.source_type === 'jira_issue';
  const isNotes = session?.source_type === 'notes';
  const allowEmptyRepo = isJira || isNotes;

  const updateMutation = useMutation({
    mutationFn: (patch: { prompt?: PromptId; targetRepo?: string; userContext?: string; sourceId?: number }) =>
      session ? api.updateDraftSession(session.id, patch) : Promise.reject(new Error('no session')),
    onSuccess: updated => {
      qc.setQueryData(['session', updated.id], updated);
    },
  });

  const sessionSourceId = session?.source_id ?? null;
  const selectedSource = sources.find(s => s.id === sessionSourceId) ?? null;
  const compatiblePrompts = selectedSource ? prompts.filter(p => p.applies_to === selectedSource.type) : prompts;

  const sessionPrompt: PromptId = session?.prompt ?? DEFAULT_PROMPT_ID;
  const effectivePromptId = compatiblePrompts.some(p => p.id === sessionPrompt)
    ? sessionPrompt
    : (compatiblePrompts[0]?.id ?? sessionPrompt);
  const selectedPrompt = prompts.find(p => p.id === effectivePromptId);

  // If the current prompt isn't compatible with the chosen source, snap to the first compatible one.
  useEffect(() => {
    if (!isDraft) return;
    if (effectivePromptId === sessionPrompt) return;
    updateMutation.mutate({ prompt: effectivePromptId });
  }, [isDraft, effectivePromptId, sessionPrompt, updateMutation]);

  if (!session) return null;

  const targetRepo = session.target_repo ?? '';
  const needsContext = !!selectedPrompt?.content.includes('{{user_context}}');

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <section className='border-b px-4 py-3'>
        <div className='mb-2'>
          <SourcePicker
            sources={sources}
            value={sessionSourceId}
            loading={sourcesQuery.isLoading}
            readOnly={!isDraft}
            onChange={id => updateMutation.mutate({ sourceId: id })}
          />
        </div>
        <TargetRepoPicker
          value={targetRepo}
          onChange={v => {
            if (!isDraft) return;
            updateMutation.mutate({ targetRepo: v });
          }}
          allowEmpty={allowEmptyRepo}
        />
        {!isDraft && <p className='mt-2 text-xs text-gray-500'>Read-only — session already started.</p>}
      </section>

      <SetupPromptPicker
        prompts={compatiblePrompts}
        promptId={effectivePromptId}
        readOnly={!isDraft}
        onChange={p => updateMutation.mutate({ prompt: p })}
      />

      {needsContext && (
        <UserContextSection
          sessionId={session.id}
          value={session.user_context ?? ''}
          readOnly={!isDraft}
          onChange={v => updateMutation.mutate({ userContext: v })}
        />
      )}

      {selectedPrompt && <PromptTemplateEditor key={selectedPrompt.id} prompt={selectedPrompt} readOnly={!isDraft} />}
    </div>
  );
}

function SourcePicker({
  sources,
  value,
  loading,
  readOnly,
  onChange,
}: {
  sources: Source[];
  value: number | null;
  loading: boolean;
  readOnly: boolean;
  onChange: (id: number) => void;
}) {
  const options: SelectOption<string>[] =
    sources.length === 0
      ? [{ value: '', label: loading ? '— loading —' : '— no sources —' }]
      : sources.map(s => {
          const logo = TYPE_LOGO[s.type];
          return {
            value: String(s.id),
            label: (
              <span className='flex min-w-0 items-center gap-1.5'>
                <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
                <span className='truncate'>{s.external_id}</span>
              </span>
            ),
          };
        });

  return (
    <label className='flex items-center gap-2 text-xs text-gray-600'>
      <span className='shrink-0'>Source:</span>
      <Select<string>
        ariaLabel='Source'
        value={value !== null ? String(value) : ''}
        onChange={v => {
          if (readOnly) return;
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
        options={options}
        className='min-w-0 flex-1 text-xs'
      />
    </label>
  );
}

function UserContextSection({
  sessionId,
  value,
  readOnly,
  onChange,
}: {
  sessionId: number;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <section key={sessionId} className='flex h-56 shrink-0 flex-col border-b bg-white'>
      <div className='flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-1.5 text-[11px]'>
        <span className='text-gray-500'>What's this session about?</span>
        {!readOnly && (
          <InsertNoteButton
            onInsert={({ title, body_md }) => {
              const block = `### ${title}\n\n${body_md.trim()}`;
              const next = value.trim().length === 0 ? block : `${value.trim()}\n\n${block}`;
              onChange(next);
            }}
          />
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={readOnly}
        spellCheck
        placeholder='Describe the bug, feature, or chore. Include any relevant links, repro steps, affected users, deadlines, or constraints.'
        className='min-h-0 flex-1 resize-none bg-white p-4 text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500'
      />
    </section>
  );
}

function SetupPromptPicker({
  prompts,
  promptId,
  readOnly,
  onChange,
}: {
  prompts: Prompt[];
  promptId: PromptId;
  readOnly: boolean;
  onChange: (p: PromptId) => void;
}) {
  if (readOnly) {
    const active = prompts.find(p => p.id === promptId);
    return (
      <section className='border-b px-4 py-3 text-xs'>
        <span className='text-gray-500'>Prompt:</span>{' '}
        <span className='font-medium text-gray-800'>{active?.label ?? promptId}</span>
        {active?.hint && <span className='ml-2 text-gray-500'>· {active.hint}</span>}
      </section>
    );
  }
  return <PromptPicker prompts={prompts} promptId={promptId} setPromptId={onChange} />;
}

function TitleEditor({ sessionId, session, isJira }: { sessionId: number; session: Session | null; isJira: boolean }) {
  const queryKey = ['session', sessionId, 'commit-message'] as const;
  const noClone = !session?.clone_path;
  const active = session?.status === 'queued' || session?.status === 'running';
  const disabled = noClone || active;

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
  const noClone = !session?.clone_path;
  const active = session?.status === 'queued' || session?.status === 'running';
  const disabled = noClone || active;

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

function resolveTabValue(
  tab: SessionPanelTab,
  kind: { isJira: boolean; isNotes: boolean; isDraft: boolean },
): SessionPanelTab {
  if (kind.isDraft) return 'setup';
  if (tab === 'setup') return 'setup';
  if (kind.isNotes) return tab === 'logs' ? 'logs' : 'notes';
  if (kind.isJira && tab === 'diff') return 'pr';
  if (tab === 'notes') return 'logs';
  return tab;
}

function NotesView({ session }: { session: Session | null }) {
  const notebookId = session?.item_id ?? null;
  const notebookQuery = useQuery({
    queryKey: notebookId !== null ? ['notebook', notebookId] : ['notebook-noop'],
    queryFn: () => (notebookId !== null ? api.getNotebook(notebookId) : Promise.resolve(null)),
    enabled: notebookId !== null,
  });

  if (notebookId === null) {
    return <div className='p-4 text-sm text-gray-500'>This notes session is not bound to a notebook.</div>;
  }
  if (notebookQuery.isPending) {
    return <div className='p-4 text-sm text-gray-500'>Loading notes…</div>;
  }
  if (notebookQuery.isError || !notebookQuery.data) {
    return (
      <div className='p-4 text-sm text-rose-600'>
        Failed to load notes
        {notebookQuery.error instanceof Error ? `: ${notebookQuery.error.message}` : '.'}
      </div>
    );
  }

  const notebook = notebookQuery.data;
  const active = session?.status === 'queued' || session?.status === 'running';

  return (
    <div className='h-full overflow-auto bg-white p-4'>
      <div className='mb-3 flex items-center justify-between text-xs text-gray-500'>
        <span>
          Notebook: <span className='font-medium text-gray-700'>{notebook.name}</span>
        </span>
        <span>
          {notebook.notes.length} note{notebook.notes.length === 1 ? '' : 's'}
        </span>
      </div>
      {notebook.notes.length === 0 ? (
        <p className='text-sm text-gray-500'>
          {active ? 'Waiting for the session to produce notes…' : 'No notes were produced in this notebook yet.'}
        </p>
      ) : (
        <ul className='flex flex-col gap-3'>
          {notebook.notes.map(note => (
            <li key={note.id} className='rounded-md border border-gray-200 bg-white p-3'>
              <h4 className='text-sm font-semibold'>{note.title}</h4>
              <div className='prose prose-sm mt-2 max-w-none text-sm text-gray-700'>
                <Markdown>{note.body_md}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const map: Record<Session['status'], string> = {
    draft: 'status-secondary',
    queued: 'status-secondary',
    running: 'status-primary',
    succeeded: 'status-success',
    failed: 'status-danger',
    aborted: 'status-secondary',
  };
  return <span className={cn('chip-sm', map[status])}>{status}</span>;
}
