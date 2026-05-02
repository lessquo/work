import { HighlightMatch } from '@/components/HighlightMatch';
import type { ItemCardProps } from '@/components/items/ItemCard';
import { ItemCardLayout } from '@/components/items/ItemCardLayout';
import { StatusBadge } from '@/components/items/StatusBadge';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { parseJiraRaw, type JiraRaw } from '@/lib/api';
import { timeAgo } from '@/lib/time';

export function JiraIssueCard({ item, selected = false, matches, onSelect, onOpenSession }: ItemCardProps) {
  const jira = parseJiraRaw(item.raw);
  const logo = TYPE_LOGO.jira_issue;
  const titleText = jira.summary ?? item.key;
  const titleField = jira.summary ? 'title' : 'key';

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      rightMeta={
        <div className='text-[11px] text-gray-400'>
          <HighlightMatch text={item.key} matches={matches} field='key' />
        </div>
      }
      body={
        <>
          <div className='flex items-center gap-2'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <StatusBadge item={item} />
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='truncate text-sm font-medium hover:underline'
            >
              <HighlightMatch text={titleText} matches={matches} field={titleField} />
            </a>
          </div>
          {jira.issuetype && <div className='mt-0.5 truncate text-xs text-gray-500'>{jira.issuetype}</div>}
          <JiraStats jira={jira} />
        </>
      }
    />
  );
}

function JiraStats({ jira }: { jira: JiraRaw }) {
  const parts: string[] = [];
  if (jira.assignee) parts.push(jira.assignee);
  if (jira.priority) parts.push(jira.priority);
  if (jira.created) parts.push(`created ${timeAgo(jira.created)}`);
  if (jira.updated) parts.push(`updated ${timeAgo(jira.updated)}`);
  return <MetaRow parts={parts} />;
}
