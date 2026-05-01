import { Field, FieldList, ItemPanelLayout } from '@/components/items/ItemPanelLayout';
import { parseGithubPrRaw, type GithubPrRaw, type Item } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { GitBranch } from 'lucide-react';

export function GithubPrPanel({ item, isFlowMode }: { item: Item; isFlowMode: boolean }) {
  const pr = parseGithubPrRaw(item.raw);
  const status = prStatus(pr);
  return (
    <ItemPanelLayout
      item={item}
      isFlowMode={isFlowMode}
      headerKey={`#${item.key}`}
      badge={{ label: status, color: STATUS_COLOR[status] }}
      body={
        <FieldList>
          <Field label='Branch'>
            {pr.headRefName ? (
              <span className='inline-flex items-center gap-1 font-mono text-xs'>
                <GitBranch className='size-3.5' />
                {pr.headRefName}
              </span>
            ) : (
              '—'
            )}
          </Field>
          <Field label='Author'>{pr.author?.login ? `@${pr.author.login}` : '—'}</Field>
          <Field label='Created'>{pr.createdAt ? timeAgo(pr.createdAt) : '—'}</Field>
          <Field label='Updated'>{pr.updatedAt ? timeAgo(pr.updatedAt) : '—'}</Field>
          {pr.mergedAt && <Field label='Merged'>{timeAgo(pr.mergedAt)}</Field>}
        </FieldList>
      }
    />
  );
}

type PrStatus = 'draft' | 'open' | 'merged' | 'closed';

function prStatus(pr: GithubPrRaw): PrStatus {
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
