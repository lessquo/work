import { api, itemCreationTime } from '@/lib/api';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { useParams } from 'react-router';

export function WorkflowPanel() {
  const { sourceId, workflowId } = useParams();
  const sid = Number(sourceId);
  const wid = workflowId ? Number(workflowId) : null;
  const [, setOpenItemId] = useQueryState('item', parseAsInteger);
  const [, setOpenSessionId] = useQueryState('session', parseAsInteger);

  const workflowsQuery = useSuspenseQuery({
    queryKey: ['source', sid, 'workflows'],
    queryFn: () => api.listSourceWorkflows(sid),
  });
  const workflow = wid !== null ? workflowsQuery.data.find(w => w.id === wid) : undefined;
  const latestSession = workflow?.sessions.reduce<typeof workflow.sessions[number] | null>(
    (acc, s) => (acc === null || s.created_at > acc.created_at ? s : acc),
    null,
  );
  const latestItem = workflow?.items.reduce<typeof workflow.items[number] | null>(
    (acc, it) => (acc === null || itemCreationTime(it) > itemCreationTime(acc) ? it : acc),
    null,
  );
  const itemTime = latestItem ? itemCreationTime(latestItem) : null;
  const sessionTime = latestSession?.created_at ?? null;
  const openAsItem = itemTime !== null && (sessionTime === null || itemTime > sessionTime);
  const openAsSession = sessionTime !== null && !openAsItem;

  useEffect(() => {
    if (openAsItem && latestItem) setOpenItemId(latestItem.id);
    else if (openAsSession && latestSession) setOpenSessionId(latestSession.id);
  }, [openAsItem, openAsSession, latestItem, latestSession, setOpenItemId, setOpenSessionId]);

  return null;
}
