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
  const logo = item ? TYPE_LOGO[item.type] : null;

  return (
    <li
      onClick={() => onOpen(session.id)}
      aria-pressed={selected}
      className={cn('selectable rounded-lg border p-3 select-none', selected && 'selected')}
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <TypeBadge type={session.source_type} />
            <StatusBadge status={session.status} />
            {logo && <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />}
            <span className='truncate text-sm font-medium' title={title}>
              {title}
            </span>
          </div>
          <div className='mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500'>
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
          {session.error && <div className='mt-1 truncate text-xs text-rose-600'>{session.error}</div>}
        </div>
        {session.pr_url && (
          <a
            href={session.pr_url}
            target='_blank'
            rel='noreferrer'
            onClick={e => e.stopPropagation()}
            className='shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100'
          >
            {isJira ? 'View Jira issue ↗' : 'View PR ↗'}
          </a>
        )}
      </div>
    </li>
  );
}

function firstLine(text: string | null): string | null {
  if (!text) return null;
  const line = text.split('\n').find(l => l.trim().length > 0);
  return line ? line.trim().slice(0, 120) : null;
}

function TypeBadge({ type }: { type: SourceSession['source_type'] }) {
  const map = {
    github_pr: 'border-sky-300 bg-sky-50 text-sky-700',
    jira_issue: 'border-violet-300 bg-violet-50 text-violet-700',
    sentry_issue: 'border-amber-300 bg-amber-50 text-amber-700',
    notes: 'border-rose-300 bg-rose-50 text-rose-700',
  } as const;
  const labelMap = { github_pr: 'PR', jira_issue: 'Jira', sentry_issue: 'Sentry', notes: 'Notes' } as const;
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', map[type])}>
      {labelMap[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: SourceSession['status'] }) {
  const map = {
    queued: 'status-secondary',
    running: 'status-primary',
    succeeded: 'status-success',
    failed: 'status-danger',
    aborted: 'status-secondary',
  } as const;
  return <span className={cn('chip-sm', map[status as keyof typeof map])}>{status}</span>;
}
