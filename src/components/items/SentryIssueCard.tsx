import { HighlightMatch } from '@/components/HighlightMatch';
import type { ItemCardProps } from '@/components/items/ItemCard';
import { ItemCardLayout } from '@/components/items/ItemCardLayout';
import { MetaRow } from '@/components/MetaRow';
import { TYPE_LOGO } from '@/components/typeLogo';
import { parseSentryRaw } from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';

export function SentryIssueCard({ item, selected = false, matches, onSelect, onOpenSession }: ItemCardProps) {
  const sentry = parseSentryRaw(item.raw);
  const logo = TYPE_LOGO.sentry_issue;
  const levelColor = LEVEL_COLOR[sentry.level ?? ''] ?? 'bg-gray-100 text-gray-600';
  const titleText = sentry.title ?? item.key;
  const titleField = sentry.title ? 'title' : 'key';

  return (
    <ItemCardLayout
      item={item}
      selected={selected}
      onSelect={onSelect}
      onOpenSession={onOpenSession}
      rightMeta={sentry.shortId ? <div className='text-[11px] text-gray-400'>{sentry.shortId}</div> : null}
      body={
        <>
          <div className='flex items-center gap-2'>
            <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                levelColor,
              )}
            >
              {sentry.level ?? 'issue'}
            </span>
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='truncate text-sm font-medium hover:underline'
            >
              <HighlightMatch text={titleText} matches={matches} field={titleField} />
            </a>
          </div>
          {sentry.culprit && <div className='mt-0.5 truncate text-xs text-gray-500'>{sentry.culprit}</div>}
          <SentryStats sentry={sentry} />
        </>
      }
    />
  );
}

function SentryStats({ sentry }: { sentry: ReturnType<typeof parseSentryRaw> }) {
  const parts: string[] = [];
  const eventCount = toInt(sentry.count);
  const userCount = toInt(sentry.userCount);
  if (eventCount !== null) parts.push(`${formatCount(eventCount)} ${eventCount === 1 ? 'event' : 'events'}`);
  if (userCount !== null) parts.push(`${formatCount(userCount)} ${userCount === 1 ? 'user' : 'users'}`);
  if (sentry.firstSeen) parts.push(`first ${timeAgo(sentry.firstSeen)}`);
  if (sentry.lastSeen) parts.push(`last ${timeAgo(sentry.lastSeen)}`);
  return <MetaRow parts={parts} />;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
}

const LEVEL_COLOR: Record<string, string> = {
  fatal: 'bg-rose-100 text-rose-700',
  error: 'bg-orange-100 text-orange-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  debug: 'bg-gray-100 text-gray-600',
};
