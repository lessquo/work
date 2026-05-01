import { ItemCardLayout } from '@/components/ItemCardLayout';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { parseGithubPrRaw, type GithubPrRaw, type ItemWithSessions } from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { GitBranch } from 'lucide-react';

export function GithubPrCard({
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
  const pr = parseGithubPrRaw(item.raw);
  const logo = TYPE_LOGO.github_pr;
  const status = displayStatus(pr);
  const statusColor = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600';
  const title = pr.title ?? item.key;

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      rightMeta={pr.number ? <div className='text-[11px] text-gray-400'>#{pr.number}</div> : null}
      body={
        <>
          <div className='flex items-center gap-2'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <span
              className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', statusColor)}
            >
              {status}
            </span>
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='truncate text-sm font-medium hover:underline'
            >
              {title}
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

type PrStatus = 'draft' | 'open' | 'merged' | 'closed';

function displayStatus(pr: GithubPrRaw): PrStatus {
  if (pr.state === 'MERGED') return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  if (pr.isDraft) return 'draft';
  return 'open';
}

const STATUS_COLOR: Record<PrStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-emerald-100 text-emerald-700',
  merged: 'bg-violet-100 text-violet-700',
  closed: 'bg-rose-100 text-rose-700',
};
