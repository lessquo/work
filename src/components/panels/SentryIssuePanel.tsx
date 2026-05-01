import { Field, FieldList, ItemPanelLayout } from '@/components/panels/ItemPanelLayout';
import { parseSentryRaw, type Item } from '@/lib/api';
import { timeAgo } from '@/lib/time';

export function SentryIssuePanel({ item, isFlowMode }: { item: Item; isFlowMode: boolean }) {
  const s = parseSentryRaw(item.raw);
  const events = toInt(s.count);
  const users = toInt(s.userCount);
  return (
    <ItemPanelLayout
      item={item}
      isFlowMode={isFlowMode}
      headerKey={item.key}
      badge={{
        label: s.level ?? 'issue',
        color: LEVEL_COLOR[s.level ?? ''] ?? 'bg-gray-100 text-gray-600',
      }}
      body={
        <FieldList>
          {s.culprit && (
            <Field label='Culprit'>
              <code className='text-xs break-all'>{s.culprit}</code>
            </Field>
          )}
          <Field label='Events'>{events !== null ? formatCount(events) : '—'}</Field>
          <Field label='Users'>{users !== null ? formatCount(users) : '—'}</Field>
          <Field label='First seen'>{s.firstSeen ? timeAgo(s.firstSeen) : '—'}</Field>
          <Field label='Last seen'>{s.lastSeen ? timeAgo(s.lastSeen) : '—'}</Field>
        </FieldList>
      }
    />
  );
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
