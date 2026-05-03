import { HighlightMatch } from '@/components/HighlightMatch';
import type { ItemCardProps } from '@/components/items/ItemCard';
import { ItemCardLayout } from '@/components/items/ItemCardLayout';
import { StatusBadge } from '@/components/items/StatusBadge';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { parseGithubPrRaw, type GithubPrRaw } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { GitBranch } from 'lucide-react';

export function GithubPrCard({ item, selected = false, matches, onSelect, onOpenSession }: ItemCardProps) {
  const pr = parseGithubPrRaw(item.raw);
  const logo = TYPE_LOGO.github_pr;
  const titleText = pr.title ?? item.key;
  const titleField = pr.title ? 'title' : 'key';

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      rightMeta={pr.number ? <div className='text-xs text-gray-400'>#{pr.number}</div> : null}
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
          {pr.headRefName && (
            <div className='mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500'>
              <GitBranch className='size-3' />
              <span className='truncate'>{pr.headRefName}</span>
            </div>
          )}
          <PrStats pr={pr} />
        </>
      }
    />
  );
}

function PrStats({ pr }: { pr: GithubPrRaw }) {
  const parts: string[] = [];
  if (pr.author?.login) parts.push(`@${pr.author.login}`);
  if (pr.createdAt) parts.push(`opened ${timeAgo(pr.createdAt)}`);
  if (pr.updatedAt) parts.push(`updated ${timeAgo(pr.updatedAt)}`);
  return <MetaRow parts={parts} />;
}
