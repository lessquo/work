import { type ItemWithSessions, type SessionStatus } from '@/lib/api';
import { cn } from '@/lib/cn';

export function ItemCardLayout({
  item,
  selected = false,
  onSelect,
  onOpenSession,
  body,
  rightMeta,
}: {
  item: ItemWithSessions;
  selected?: boolean;
  onSelect?: (id: number, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
  onOpenSession?: (sessionId: number) => void;
  body: React.ReactNode;
  rightMeta?: React.ReactNode;
}) {
  function handleCardClick(e: React.MouseEvent<HTMLLIElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, label')) return;
    onSelect?.(item.id, { shiftKey: e.shiftKey, metaKey: e.metaKey || e.ctrlKey });
  }

  return (
    <li
      onClick={handleCardClick}
      aria-pressed={selected}
      className={cn(
        'cursor-pointer rounded-lg border p-3 select-none',
        selected ? 'selected-primary' : 'bg-white hover:border-gray-300 hover:shadow-sm',
      )}
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>{body}</div>
        {(rightMeta || item.sessions.length > 0) && (
          <div className='flex shrink-0 flex-col items-end gap-1'>
            {item.sessions.length > 0 && (
              <div className='flex flex-wrap items-center justify-end gap-1'>
                {item.sessions.map((session, i) => (
                  <SessionBadge
                    key={session.id}
                    sessionId={session.id}
                    status={session.status}
                    isLatest={i === 0}
                    onOpenSession={onOpenSession}
                  />
                ))}
              </div>
            )}
            {rightMeta}
          </div>
        )}
      </div>
    </li>
  );
}

function SessionBadge({
  sessionId,
  status,
  isLatest = true,
  onOpenSession,
}: {
  sessionId: number;
  status: SessionStatus;
  isLatest?: boolean;
  onOpenSession?: (sessionId: number) => void;
}) {
  const tone: Record<SessionStatus, string> = {
    draft: 'btn-secondary',
    queued: 'btn-secondary',
    running: 'btn-primary',
    succeeded: 'btn-success',
    failed: 'btn-danger',
    aborted: 'btn-secondary',
  };
  return (
    <button
      type='button'
      onClick={e => {
        e.stopPropagation();
        onOpenSession?.(sessionId);
      }}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase hover:brightness-95',
        tone[status],
        !isLatest && 'opacity-60',
      )}
      title={`Session #${sessionId} · ${status}`}
      aria-label={`Open session ${sessionId}`}
    >
      {isLatest ? `#${sessionId} · ${status}` : `#${sessionId}`}
    </button>
  );
}
