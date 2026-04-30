import { FlowCard } from '@/components/FlowCard';
import { CreateJiraIssuePanel } from '@/components/panels/CreateJiraIssuePanel';
import { api } from '@/lib/api';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { parseAsBoolean, parseAsInteger, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

export function FlowsPage() {
  const { sourceId, flowId } = useParams();
  const id = Number(sourceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: api.listFlows,
    refetchInterval: 5000,
  });
  const flows = useMemo(() => flowsQuery.data ?? [], [flowsQuery.data]);
  const error = flowsQuery.error instanceof Error ? flowsQuery.error.message : null;

  useEffect(() => {
    if (flows.length === 0) return;
    if (flowId) return;
    const params = new URLSearchParams(window.location.search);
    navigate({ pathname: `/sources/${sourceId}/flows/${flows[0].id}`, search: params.toString() }, { replace: true });
  }, [flows, flowId, sourceId, navigate]);

  return (
    <>
      <title>Flows · Work</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h1 className='text-lg font-semibold'>Flows</h1>
            <div className='flex items-center gap-2'>
              <button
                onClick={async () => {
                  const flow = await api.createFlow();
                  await queryClient.invalidateQueries({ queryKey: ['flows'] });
                  const params = new URLSearchParams(window.location.search);
                  navigate({
                    pathname: `/sources/${sourceId}/flows/${flow.id}`,
                    search: params.toString(),
                  });
                }}
                className='btn-md btn-secondary'
              >
                New flow
              </button>
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
          </div>

          {error && (
            <div className='mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
          )}

          {flowsQuery.isLoading ? (
            <p className='text-gray-500'>Loading…</p>
          ) : flows.length === 0 ? (
            <p className='text-gray-500'>No flows yet.</p>
          ) : (
            <ul className='flex flex-col gap-2'>
              {flows.map(flow => (
                <FlowCard key={flow.id} flow={flow} />
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
          flowId && (
            <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
              <Outlet />
            </div>
          )
        )}
      </div>
    </>
  );
}
