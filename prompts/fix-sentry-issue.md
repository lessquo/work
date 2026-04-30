---
label: Fix Sentry Issue
hint: Make the minimal code change to fix the bug.
applies_to: github_pr
---

## Issue

Fetch Sentry issue and the latest event (with full stacktrace, breadcrumbs, request/user context) before investigating. `SENTRY_TOKEN` is in env.

```
curl -s -H "Authorization: Bearer $SENTRY_TOKEN" https://sentry.io/api/0/issues/{{issueId}}/
curl -s -H "Authorization: Bearer $SENTRY_TOKEN" https://sentry.io/api/0/issues/{{issueId}}/events/latest/
```

Sentry URL: {{sentry_url}}

## Your tasks

1. Fetch Sentry issue.
2. Investigate the affected file(s) and identify the root cause. Use context7 MCP for libraries best practice.
3. Edit — make the minimal change that fixes it. Do not run tests or git. (or, if unsure, write `./CLAUDE_NOTES.md` instead).
4. Write `./COMMIT_MSG.txt` — required. One line, maximum 72 characters, Conventional Commits format `fix(<area>): <subject>` where `<area>` is a short identifier for the changed module/file (e.g. `serializer`, `auth`, `webhook`). The subject must be imperative mood (`null check on user id`, not `fixed null check`), no trailing period, no quotes. Example: `fix(serializer): null check on user id`. The worker uses the first line of this file as the git commit subject and PR title.
5. Write `./PR_BODY.md` — required. Shorter is better. Exactly these three sections in Markdown and nothing else:

   ```md
   ### Sentry link

   [{{shortId}}]({{sentry_url}})

   ### Issue

   <one or two sentences: what the bug was and what this change does. Use inline code for identifiers.>

   ### Changes

   - <short bullet per change, referencing the file. Prefer one or two bullets.>
   ```

## Before you finish

Verify that both `./COMMIT_MSG.txt` and `./PR_BODY.md` exist at the repo root. If either is missing, create it now. These files are required — without them the commit and PR cannot be created cleanly.
