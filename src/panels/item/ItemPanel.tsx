import { api } from '@/lib/api';
import { GithubPrPanel } from '@/panels/item/GithubPrPanel';
import { JiraIssuePanel } from '@/panels/item/JiraIssuePanel';
import { PlanPanel } from '@/panels/item/PlanPanel';
import { SentryIssuePanel } from '@/panels/item/SentryIssuePanel';
import { useSuspenseQuery } from '@tanstack/react-query';

export function ItemPanel({ itemId }: { itemId: number }) {
  const itemQuery = useSuspenseQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.getItem(itemId),
  });
  const item = itemQuery.data;

  if (!item) return null;

  switch (item.type) {
    case 'jira_issue':
      return <JiraIssuePanel item={item} />;
    case 'github_pr':
      return <GithubPrPanel item={item} />;
    case 'sentry_issue':
      return <SentryIssuePanel item={item} />;
    case 'plan':
      return <PlanPanel item={item} />;
  }
}
