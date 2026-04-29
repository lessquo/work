import { fetchSentryProjects } from '@server/integrations/sentry.js';
import { Hono } from 'hono';

export const sentryRoute = new Hono();

sentryRoute.get('/projects', async c => {
  try {
    const projects = await fetchSentryProjects();
    return c.json(projects);
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
