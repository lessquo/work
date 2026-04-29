import { fetchJiraProjects } from '@server/integrations/jira.js';
import { Hono } from 'hono';

export const jiraRoute = new Hono();

jiraRoute.get('/projects', async c => {
  try {
    const projects = await fetchJiraProjects();
    return c.json(projects);
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
