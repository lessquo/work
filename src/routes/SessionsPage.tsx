import { SessionCard } from '@/components/SessionCard';
import { PillTabsList, PillTabsTab, TabsRoot } from '@/components/ui/Tabs';
import { api, type ItemType, type SessionStatus, type SourceSession } from '@/lib/api';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

type TypeFilter = 'all' | ItemType;
type StatusFilter = 'all' | 'active' | 'finished';

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'github_pr', label: 'PR' },
  { value: 'jira_issue', label: 'Jira draft' },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'finished', label: 'Finished' },
];

function isActive(status: SessionStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function SessionsPage() {
  const { sourceId, sessionId } = useParams();
  const id = Number(sourceId);
  const openSessionId = sessionId ? Number(sessionId) : null;
  const navigate = useNavigate();

  function openSession(sid: number) {
    navigate({ pathname: `/sources/${sourceId}/sessions/${sid}`, search: window.location.search });
  }

  const sourceQuery = useSuspenseQuery({
    queryKey: ['source', id],
    queryFn: () => api.getSource(id),
  });
  const source = sourceQuery.data;

  const sessionsQuery = useQuery({
    queryKey: ['source', id, 'sessions'],
    queryFn: () => api.listSourceSessions(id),
    refetchInterval: 5000,
  });
  const sessions = useMemo<SourceSession[]>(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (statusFilter === 'active' && !isActive(s.status)) return false;
      if (statusFilter === 'finished' && isActive(s.status)) return false;
      return true;
    });
  }, [sessions, typeFilter, statusFilter]);

  const error = sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null;

  useEffect(() => {
    if (filtered.length === 0) return;
    if (openSessionId !== null) return;
    const params = new URLSearchParams(window.location.search);
    navigate(
      { pathname: `/sources/${sourceId}/sessions/${filtered[0].id}`, search: params.toString() },
      { replace: true },
    );
  }, [filtered, openSessionId, sourceId, navigate]);

  return (
    <>
      <title>{`${source.external_id} · Sessions`}</title>

      <div className='flex flex-1 overflow-y-scroll'>
        <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
          <div className='mb-4 flex flex-wrap items-center gap-3'>
            <h1 className='text-lg font-semibold'>Sessions</h1>
            <TabsRoot value={typeFilter} onValueChange={v => setTypeFilter(v as TypeFilter)}>
              <PillTabsList>
                {TYPE_TABS.map(tab => (
                  <PillTabsTab key={tab.value} value={tab.value}>
                    {tab.label}
                  </PillTabsTab>
                ))}
              </PillTabsList>
            </TabsRoot>
            <TabsRoot value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <PillTabsList>
                {STATUS_TABS.map(tab => (
                  <PillTabsTab key={tab.value} value={tab.value}>
                    {tab.label}
                  </PillTabsTab>
                ))}
              </PillTabsList>
            </TabsRoot>
          </div>

          {error && (
            <div className='mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>{error}</div>
          )}

          {sessionsQuery.isLoading ? (
            <p className='text-gray-500'>Loading…</p>
          ) : filtered.length === 0 ? (
            <p className='text-gray-500'>
              {sessions.length === 0 ? 'No sessions yet.' : 'No sessions match these filters.'}
            </p>
          ) : (
            <ul className='flex flex-col gap-2'>
              {filtered.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  selected={openSessionId === session.id}
                  onOpen={openSession}
                />
              ))}
            </ul>
          )}
        </div>
        {openSessionId !== null && (
          <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
            <Outlet />
          </div>
        )}
      </div>
    </>
  );
}
