import { PageHeader } from '@/components/PageHeader';
import { SessionCard } from '@/components/SessionCard';
import { api } from '@/lib/api';
import { useNumberParam } from '@/lib/router';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useNavigate } from 'react-router';

export function SessionsPage() {
  const sessionId = useNumberParam('sessionId');
  const navigate = useNavigate();

  function openSession(sid: number) {
    navigate({ pathname: `/sessions/${sid}`, search: window.location.search });
  }

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: api.listSessions,
    refetchInterval: 5000,
  });
  const sessions = sessionsQuery.data ?? [];

  const error = sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null;

  return (
    <>
      <title>Work Sessions</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3'>
            <div className='flex items-center gap-2'>
              <PageHeader />
            </div>
          </div>

          {error && (
            <div className='mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
          )}

          {sessionsQuery.isLoading ? (
            <p className='text-gray-500'>Loading…</p>
          ) : sessions.length === 0 ? (
            <p className='text-gray-500'>No sessions yet.</p>
          ) : (
            <ul className='flex flex-col gap-2'>
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  selected={sessionId === session.id}
                  onOpen={openSession}
                />
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
