import { TYPE_LOGO } from '@/components/typeLogo';
import { type SourceSession } from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';

export function SessionCard({
  session,
  selected = false,
  onOpen,
}: {
  session: SourceSession;
  selected?: boolean;
  onOpen: (sessionId: number) => void;
}) {
  const isJira = session.source_type === 'jira_issue';
  const item =
    session.item_key && session.item_type
      ? {
          key: session.item_key,
          type: session.item_type,
        }
      : null;
  const title =
    session.item_title || firstLine(session.user_context) || (isJira ? '(empty draft)' : `Session #${session.id}`);
  const logo = TYPE_LOGO[session.source_type];

  return (
    <li
      onClick={() => onOpen(session.id)}
      aria-pressed={selected}
      className={cn('selectable rounded-lg border p-3 select-none', selected && 'selected')}
    >
      <div className='flex items-center gap-2'>
        <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
        <StatusBadge status={session.status} />
        <span className='truncate text-sm font-medium' title={title}>
          {title}
        </span>
      </div>
      <div className='mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500'>
        <span>#{session.id}</span>
        <span>·</span>
        <code className='font-mono text-gray-700'>{session.prompt}</code>
        {session.repo && (
          <>
            <span>·</span>
            <span>{session.repo}</span>
          </>
        )}
        {item?.key && (
          <>
            <span>·</span>
            <span>{item.key}</span>
          </>
        )}
        <span>·</span>
        <span>{timeAgo(session.created_at)}</span>
      </div>
      {session.error && <div className='mt-1 truncate text-sm text-rose-600'>{session.error}</div>}
    </li>
  );
}

function firstLine(text: string | null): string | null {
  if (!text) return null;
  const line = text.split('\n').find(l => l.trim().length > 0);
  return line ? line.trim().slice(0, 120) : null;
}

function StatusBadge({ status }: { status: SourceSession['status'] }) {
  const map = {
    draft: 'status-neutral',
    queued: 'status-neutral',
    running: 'status-primary',
    succeeded: 'status-success',
    failed: 'status-danger',
    aborted: 'status-neutral',
  } as const satisfies Record<SourceSession['status'], string>;
  return <span className={cn('chip-sm', map[status])}>{status}</span>;
}
