import { FlowCard } from '@/components/flows/FlowCard';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/ui/Toast.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router';

export function FlowsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: api.listFlows,
    refetchInterval: 5000,
  });
  const flows = useMemo(() => flowsQuery.data ?? [], [flowsQuery.data]);
  const error = flowsQuery.error instanceof Error ? flowsQuery.error.message : null;

  const syncableItemIds = useMemo(
    () =>
      flows
        .flatMap(f => f.items)
        .filter(i => i.type !== 'plan')
        .map(i => i.id),
    [flows],
  );

  const syncItemsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map(id => api.syncItem(id)));
      const failed = results.filter(r => r.status === 'rejected').length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['allItems'] });
      if (failed > 0) {
        toast.add({ title: `Synced ${total - failed}/${total} items`, type: 'error' });
      } else {
        toast.add({ title: `Synced ${total} items`, type: 'success' });
      }
    },
    onError: e => {
      toast.add({
        title: 'Failed to sync items',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    },
  });

  return (
    <>
      <title>Work Flows</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='flex min-w-0 flex-1 flex-col gap-4 overflow-y-scroll py-6'>
          <div className='sticky top-0 z-10 flex items-center justify-between px-4'>
            <div className='flex items-center gap-2'>
              <PageHeader />
            </div>
            <div className='flex items-center gap-2'>
              <div className='stuck-on-scroll rounded-full'>
                <Tooltip content={syncItemsMutation.isPending ? 'Syncing items' : 'Sync items'}>
                  <button
                    onClick={() => syncItemsMutation.mutate(syncableItemIds)}
                    disabled={syncableItemIds.length === 0 || syncItemsMutation.isPending}
                    className='btn-md btn-ghost rounded-full'
                    aria-label={syncItemsMutation.isPending ? 'Syncing items' : 'Sync items'}
                  >
                    <RefreshCw className={syncItemsMutation.isPending ? 'animate-spin' : undefined} />
                  </button>
                </Tooltip>
              </div>
              <div className='stuck-on-scroll rounded-full'>
                <Tooltip content='New flow'>
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
                    className='btn-md btn-ghost rounded-full'
                    aria-label='New flow'
                  >
                    <Plus />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          {error && (
            <div className='mx-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
          )}

          {flowsQuery.isLoading ? (
            <p className='mx-4 text-gray-500'>Loading…</p>
          ) : flows.length === 0 ? (
            <p className='mx-4 text-gray-500'>No flows yet.</p>
          ) : (
            <ul className='flex flex-col divide-y'>
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
