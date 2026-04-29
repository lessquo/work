import { GithubPrCard } from '@/components/GithubPrCard';
import { JiraIssueCard } from '@/components/JiraIssueCard';
import { SentryIssueCard } from '@/components/SentryIssueCard';
import type { ItemWithSessions } from '@/lib/api';

export function ItemCard({
  item,
  selected = false,
  onSelect,
  onOpenSession,
}: {
  item: ItemWithSessions;
  selected?: boolean;
  onSelect?: (id: number, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
  onOpenSession?: (sessionId: number) => void;
}) {
  switch (item.type) {
    case 'sentry_issue':
      return <SentryIssueCard item={item} selected={selected} onSelect={onSelect} onOpenSession={onOpenSession} />;
    case 'jira_issue':
      return <JiraIssueCard item={item} selected={selected} onSelect={onSelect} onOpenSession={onOpenSession} />;
    case 'github_pr':
      return <GithubPrCard item={item} selected={selected} onSelect={onSelect} onOpenSession={onOpenSession} />;
  }
}
