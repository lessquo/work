import { HighlightMatch } from '@/components/HighlightMatch';
import type { ItemCardProps } from '@/components/items/ItemCard';
import { ItemCardLayout } from '@/components/items/ItemCardLayout';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { timeAgo } from '@/lib/time';

export function NotesItemCard({ item, selected = false, matches, onSelect, onOpenSession }: ItemCardProps) {
  const logo = TYPE_LOGO.notes;
  const noteCount = (item as { note_count?: number }).note_count ?? 0;

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      rightMeta={
        <div className='text-[11px] text-gray-400'>
          {noteCount} note{noteCount === 1 ? '' : 's'}
        </div>
      }
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
