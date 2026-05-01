import { GithubPrCard } from '@/components/items/GithubPrCard';
import { JiraIssueCard } from '@/components/items/JiraIssueCard';
import { NotesItemCard } from '@/components/items/NotesItemCard';
import { SentryIssueCard } from '@/components/items/SentryIssueCard';
import type { ItemWithSessions } from '@/lib/api';
import type { FuseResultMatch } from 'fuse.js';

export type ItemCardProps = {
  item: ItemWithSessions;
  selected?: boolean;
  matches?: ReadonlyArray<FuseResultMatch>;
  onSelect?: (id: number, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
  onOpenSession?: (sessionId: number) => void;
};

export function ItemCard(props: ItemCardProps) {
  switch (props.item.type) {
    case 'sentry_issue':
      return <SentryIssueCard {...props} />;
    case 'jira_issue':
      return <JiraIssueCard {...props} />;
    case 'github_pr':
      return <GithubPrCard {...props} />;
    case 'notes':
      return <NotesItemCard {...props} />;
  }
}
