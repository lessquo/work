import { CreateJiraIssuePanel } from '@/components/panels/CreateJiraIssuePanel';
import { WorkflowCard } from '@/components/WorkflowCard';
import { api } from '@/lib/api';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { parseAsBoolean, parseAsInteger, useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

export function WorkflowsPage() {
  const { sourceId, workflowId } = useParams();
  const id = Number(sourceId);
  const navigate = useNavigate();
  const [jiraDraftOpen, setJiraDraftOpen] = useQueryState('jiraDraft', parseAsBoolean.withDefault(false));
  const [, setOpenItemId] = useQueryState('item', parseAsInteger);
  const [, setOpenSessionId] = useQueryState('session', parseAsInteger);

  const sourceQuery = useSuspenseQuery({
    queryKey: ['source', id],
    queryFn: () => api.getSource(id),
  });
  const source = sourceQuery.data;

  const promptsQuery = useSuspenseQuery({ queryKey: ['prompts'], queryFn: api.listPrompts });
  const prompts = promptsQuery.data;

  const workflowsQuery = useQuery({
    queryKey: ['source', id, 'workflows'],
    queryFn: () => api.listSourceWorkflows(id),
    refetchInterval: 5000,
  });
  const workflows = workflowsQuery.data ?? [];
  const error = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;

  useEffect(() => {
    if (workflows.length === 0) return;
    if (workflowId) return;
    const params = new URLSearchParams(window.location.search);
    navigate(
      { pathname: `/sources/${sourceId}/workflows/${workflows[0].id}`, search: params.toString() },
      { replace: true },
    );
  }, [workflows, workflowId, sourceId, navigate]);

  return (
    <>
      <title>{`${source.external_id} workflows · Work`}</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h1 className='text-lg font-semibold'>Workflows</h1>
            {source.type === 'jira_issue' && (
              <button
                onClick={() => {
                  setOpenItemId(null);
                  setOpenSessionId(null);
                  setJiraDraftOpen(true);
                }}
                className='btn-md btn-primary'
              >
                Create Jira issue
              </button>
            )}
          </div>

          {error && (
            <div className='mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
          )}

          {workflowsQuery.isLoading ? (
            <p className='text-gray-500'>Loading…</p>
          ) : workflows.length === 0 ? (
            <p className='text-gray-500'>No workflows yet.</p>
          ) : (
            <ul className='flex flex-col gap-2'>
              {workflows.map(workflow => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </ul>
          )}
        </div>
        {jiraDraftOpen ? (
          <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
            <CreateJiraIssuePanel
              sourceId={id}
              projectKey={source.external_id}
              prompts={prompts}
              onClose={() => setJiraDraftOpen(false)}
              onSessionStarted={sessionId => {
                setJiraDraftOpen(false);
                setOpenSessionId(sessionId);
              }}
            />
          </div>
        ) : (
          workflowId && (
            <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
              <Outlet />
            </div>
          )
        )}
      </div>
    </>
  );
}
