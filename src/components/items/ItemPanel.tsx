import { GithubPrPanel } from '@/components/items/GithubPrPanel';
import { JiraIssuePanel } from '@/components/items/JiraIssuePanel';
import { NotebookPanel } from '@/components/items/NotebookPanel';
import { SentryIssuePanel } from '@/components/items/SentryIssuePanel';
import { api, type Item } from '@/lib/api';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsArrayOf, parseAsInteger, useQueryState } from 'nuqs';
import { useParams } from 'react-router';

export function ItemPanel({ itemId: itemIdProp }: { itemId?: number } = {}) {
  const { itemId: itemIdParam } = useParams();
  const [selectedIds] = useQueryState('selected', parseAsArrayOf(parseAsInteger).withDefault([]));
  const itemId = itemIdProp ?? (itemIdParam ? Number(itemIdParam) : (selectedIds[0] ?? null));
  const isFlowMode = itemIdProp !== undefined;

  const itemQuery = useSuspenseQuery({
    queryKey: itemId !== null ? ['item', itemId] : ['item-noop'],
    queryFn: (): Promise<Item | null> => (itemId !== null ? api.getItem(itemId) : Promise.resolve(null)),
  });
  const item = itemQuery.data;

  if (!item) return null;

  switch (item.type) {
    case 'jira_issue':
      return <JiraIssuePanel item={item} isFlowMode={isFlowMode} />;
    case 'github_pr':
      return <GithubPrPanel item={item} isFlowMode={isFlowMode} />;
    case 'sentry_issue':
      return <SentryIssuePanel item={item} isFlowMode={isFlowMode} />;
    case 'notes':
      return <NotebookPanel item={item} />;
  }
}
