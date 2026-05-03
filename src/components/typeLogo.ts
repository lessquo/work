import type { ItemType } from '@/lib/api';

export const TYPE_LOGO: Record<ItemType, { src: string; alt: string }> = {
  sentry_issue: { src: '/logos/sentry.png', alt: 'Sentry' },
  jira_issue: { src: '/logos/jira.png', alt: 'Jira' },
  github_pr: { src: '/logos/github.svg', alt: 'GitHub' },
  plan: { src: '/logos/plan.svg', alt: 'Plan' },
};
