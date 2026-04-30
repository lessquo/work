import { ItemCardLayout } from '@/components/ItemCardLayout';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { parseNotebookRaw, type ItemWithSessions } from '@/lib/api';
import { timeAgo } from '@/lib/time';

export function NotesItemCard({
  item,
  selected = false,
  onSelect,
  onOpenSession,
}: {
  item: ItemWithSessions & { note_count?: number };
  selected?: boolean;
  onSelect?: (id: number, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
  onOpenSession?: (sessionId: number) => void;
}) {
  const nb = parseNotebookRaw(item.raw);
  const logo = TYPE_LOGO.notes;
  const title = nb.name ?? 'Untitled notebook';
  const noteCount = item.note_count ?? 0;

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
            <span className='truncate text-sm font-medium'>{title}</span>
          </div>
          <MetaRow parts={[`updated ${timeAgo(item.updated_at)}`]} />
        </>
      }
    />
  );
}
