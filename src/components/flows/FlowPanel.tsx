import { api, itemCreationTime } from '@/lib/api';
import { useNumberParam } from '@/lib/useNumberParam';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useEffect } from 'react';

export function FlowPanel() {
  const flowId = useNumberParam('flowId');
  const [, setOpenItemId] = useQueryState('item', parseAsInteger);
  const [, setOpenSessionId] = useQueryState('session', parseAsInteger);

  const flowsQuery = useSuspenseQuery({
    queryKey: ['flows'],
    queryFn: api.listFlows,
  });
  const flow = flowsQuery.data.find(w => w.id === flowId);
  const latestSession = flow?.sessions.reduce<(typeof flow.sessions)[number] | null>(
    (acc, s) => (acc === null || s.created_at > acc.created_at ? s : acc),
    null,
  );
  const latestItem = flow?.items.reduce<(typeof flow.items)[number] | null>(
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
