import { HighlightMatch } from '@/components/HighlightMatch';
import type { ItemCardProps } from '@/components/items/ItemCard';
import { ItemCardLayout } from '@/components/items/ItemCardLayout';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { timeAgo } from '@/lib/time';

export function PlanItemCard({ item, selected = false, matches, onSelect, onOpenSession }: ItemCardProps) {
  const logo = TYPE_LOGO.plan;

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      body={
        <>
          <div className='flex items-center gap-2'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <span className='truncate text-sm font-medium'>
              <HighlightMatch text={item.title} matches={matches} field='title' />
            </span>
          </div>
          <MetaRow parts={[`updated ${timeAgo(item.updated_at)}`]} />
        </>
      }
    />
  );
}
