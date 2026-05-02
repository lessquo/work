import { GithubPrPanel } from '@/components/items/GithubPrPanel';
import { JiraIssuePanel } from '@/components/items/JiraIssuePanel';
import { NotebookPanel } from '@/components/items/NotebookPanel';
import { SentryIssuePanel } from '@/components/items/SentryIssuePanel';
import { api } from '@/lib/api';
import { useSuspenseQuery } from '@tanstack/react-query';

export function ItemPanel({ itemId, isFlowMode = false }: { itemId: number; isFlowMode?: boolean }) {
  const itemQuery = useSuspenseQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.getItem(itemId),
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
