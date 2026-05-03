import {
  parseGithubPrRaw,
  parseJiraRaw,
  parseSentryRaw,
  type GithubPrRaw,
  type Item,
  type JiraStatusCategory,
} from '@/lib/api';
import { cn } from '@/lib/cn';

export function StatusBadge({ item, size = 'md' }: { item: Item; size?: 'sm' | 'md' }) {
  const badge = computeBadge(item);
  if (!badge) return null;
  const sizeClasses = size === 'sm' ? 'rounded px-1 py-px text-[9px]' : 'rounded px-1.5 py-0.5 text-[10px]';
  return (
    <span className={cn('shrink-0 font-semibold tracking-wide uppercase', sizeClasses, badge.color)}>
      {badge.label}
    </span>
  );
}

const FALLBACK = 'bg-gray-100 text-gray-600';

function computeBadge(item: Item): { label: string; color: string } | null {
  switch (item.type) {
    case 'github_pr': {
      const pr = parseGithubPrRaw(item.raw);
      const status = githubPrStatus(pr);
      return { label: status, color: GITHUB_COLOR[status] };
    }
    case 'jira_issue': {
      const j = parseJiraRaw(item.raw);
      return {
        label: j.status_name ?? 'unknown',
        color: JIRA_COLOR[j.status_category ?? ''] ?? FALLBACK,
      };
    }
    case 'sentry_issue': {
      const s = parseSentryRaw(item.raw);
      const level = s.level ?? 'issue';
      return { label: level, color: SENTRY_LEVEL_COLOR[level] ?? FALLBACK };
    }
    case 'plan':
      return null;
  }
}

type GithubPrStatus = 'draft' | 'open' | 'merged' | 'closed';

function githubPrStatus(pr: GithubPrRaw): GithubPrStatus {
  if (pr.state === 'MERGED') return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  if (pr.isDraft) return 'draft';
  return 'open';
}

const GITHUB_COLOR: Record<GithubPrStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-emerald-100 text-emerald-700',
  merged: 'bg-violet-100 text-violet-700',
  closed: 'bg-rose-100 text-rose-700',
};

const JIRA_COLOR: Record<JiraStatusCategory, string> = {
  new: 'bg-gray-100 text-gray-700',
  indeterminate: 'bg-sky-100 text-sky-700',
  done: 'bg-emerald-100 text-emerald-700',
};

const SENTRY_LEVEL_COLOR: Record<string, string> = {
  fatal: 'bg-rose-100 text-rose-700',
  error: 'bg-orange-100 text-orange-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  debug: 'bg-gray-100 text-gray-600',
};
