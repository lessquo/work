import { serve } from '@hono/node-server';
import { db } from '@server/db.js';
import { githubRoute } from '@server/routes/github.js';
import { items } from '@server/routes/items.js';
import { jiraRoute } from '@server/routes/jira.js';
import { prompts } from '@server/routes/prompts.js';
import { secrets } from '@server/routes/secrets.js';
import { sentryRoute } from '@server/routes/sentry.js';
import { sessions } from '@server/routes/sessions.js';
import { settingsRoute } from '@server/routes/settings.js';
import { sources } from '@server/routes/sources.js';
import 'dotenv/config';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

// Recovery: any session still marked queued/running on boot was orphaned by a previous process
// (crash, dev-server hot-reload, etc.) — mark it aborted so the UI doesn't show it spinning forever.
const orphaned = db
  .prepare(
    `UPDATE sessions
        SET status = 'aborted',
            finished_at = datetime('now'),
            error = COALESCE(error, 'interrupted by server restart')
      WHERE status IN ('queued','running')`,
  )
  .run();
if (orphaned.changes > 0) {
  console.log(`[api] recovered ${orphaned.changes} orphaned session(s) → aborted`);
}

const app = new Hono();
app.use('*', logger());

app.get('/api/health', c => c.json({ ok: true }));
app.route('/api/sources', sources);
app.route('/api/items', items);
app.route('/api', prompts);
app.route('/api', sessions);
app.route('/api/settings', settingsRoute);
app.route('/api/secrets', secrets);
app.route('/api/sentry', sentryRoute);
app.route('/api/github', githubRoute);
app.route('/api/jira', jiraRoute);

const port = Number(process.env.API_PORT ?? 3011);
serve({ fetch: app.fetch, port }, info => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
