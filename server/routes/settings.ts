import {
  getGithubOrg,
  getJiraEmail,
  getJiraOrg,
  getMaxParallel,
  getSentryOrg,
  getSyncLimit,
  setSetting,
  SYNC_LIMIT_MAX,
  SYNC_LIMIT_MIN,
} from '@server/settings.js';
import { setRunnerConcurrency } from '@server/worker/runner.js';
import { Hono } from 'hono';

export const settingsRoute = new Hono();

function snapshot() {
  return {
    max_parallel: getMaxParallel(),
    sync_limit: getSyncLimit(),
    sentry_org: getSentryOrg(),
    github_org: getGithubOrg(),
    jira_org: getJiraOrg(),
    jira_email: getJiraEmail(),
  };
}

settingsRoute.get('/', c => c.json(snapshot()));

settingsRoute.patch('/', async c => {
  const body = await c.req.json<{
    max_parallel?: number;
    sync_limit?: number;
    sentry_org?: string;
    github_org?: string;
    jira_org?: string;
    jira_email?: string;
  }>();
  if (typeof body.max_parallel === 'number' && Number.isFinite(body.max_parallel)) {
    const clamped = Math.min(8, Math.max(1, Math.floor(body.max_parallel)));
    setSetting('max_parallel', String(clamped));
    setRunnerConcurrency(clamped);
  }
  if (typeof body.sync_limit === 'number' && Number.isFinite(body.sync_limit)) {
    const clamped = Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, Math.floor(body.sync_limit)));
    setSetting('sync_limit', String(clamped));
  }
  if (typeof body.sentry_org === 'string') {
    setSetting('sentry_org', body.sentry_org.trim());
  }
  if (typeof body.github_org === 'string') {
    setSetting('github_org', body.github_org.trim());
  }
  if (typeof body.jira_org === 'string') {
    setSetting('jira_org', body.jira_org.trim());
  }
  if (typeof body.jira_email === 'string') {
    setSetting('jira_email', body.jira_email.trim());
  }
  return c.json(snapshot());
});
