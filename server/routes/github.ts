import { fetchGithubRepos } from '@server/integrations/github.js';
import { Hono } from 'hono';

export const githubRoute = new Hono();

githubRoute.get('/repos', async c => {
  try {
    const repos = await fetchGithubRepos();
    return c.json(repos);
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
