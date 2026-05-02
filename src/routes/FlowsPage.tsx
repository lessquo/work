import { FlowCard } from '@/components/flows/FlowCard';
import { PageSwitcher } from '@/components/PageSwitcher';
import { api } from '@/lib/api';
import { useNumberParam } from '@/lib/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router';

export function FlowsPage() {
  const flowId = useNumberParam('flowId');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    navigate({ pathname: `/flows/${flows[0].id}`, search: params.toString() }, { replace: true });
  }, [flows, flowId, navigate]);

  return (
    <>
      <title>Flows · Work</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h1 className='flex items-center gap-1 text-lg font-semibold'>
              Work
              <PageSwitcher />
            </h1>
            <div className='flex items-center gap-2'>
              <button
                onClick={async () => {
                  const flow = await api.createFlow();
                  await queryClient.invalidateQueries({ queryKey: ['flows'] });
                  const params = new URLSearchParams(window.location.search);
                  navigate({
                    pathname: `/flows/${flow.id}`,
                    search: params.toString(),
                  });
                }}
                className='btn-md btn-neutral'
              >
                New flow
              </button>
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
        <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
          <Outlet />
        </div>
      </div>
    </>
  );
}
