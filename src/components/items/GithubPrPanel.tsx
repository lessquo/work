import { Field, FieldList, ItemPanelLayout } from '@/components/items/ItemPanelLayout';
import { parseGithubPrRaw, type Item } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { GitBranch } from 'lucide-react';

export function GithubPrPanel({ item, isFlowMode }: { item: Item; isFlowMode: boolean }) {
  const pr = parseGithubPrRaw(item.raw);
  return (
    <ItemPanelLayout
      item={item}
      isFlowMode={isFlowMode}
      headerKey={`#${item.key}`}
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
