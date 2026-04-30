---
label: Implement Jira Issue
hint: Implement the feature described in the Jira issue.
---

## Issue

{{user_context}}

Fetch the full Jira issue (description, comments, attachments metadata) before investigating — extract the host and key from the link above. `JIRA_EMAIL` and `JIRA_TOKEN` are in env.

```
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" -H "Accept: application/json" "https://<host>/rest/api/3/issue/<key>"
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" -H "Accept: application/json" "https://<host>/rest/api/3/issue/<key>/comment"
```

## Your tasks

1. Fetch Jira issue.
2. Investigate the relevant module(s) to understand the existing code, conventions, and the right place to add the feature. Use context7 MCP for libraries best practice.
3. Edit — implement the feature as described. Do not run tests or git. (or, if requirements are unclear or you need to make a non-obvious design decision, write `./CLAUDE_NOTES.md` instead).
4. Write `./COMMIT_MSG.txt` — required. One line, maximum 72 characters, Conventional Commits format `feat(<area>): <subject>` where `<area>` is a short identifier for the changed module/file (e.g. `serializer`, `auth`, `webhook`). The subject must be imperative mood (`add csv export to reports`, not `added csv export`), no trailing period, no quotes. Example: `feat(reports): add csv export`. The worker uses the first line of this file as the git commit subject and PR title.
5. Write `./PR_BODY.md` — required. Shorter is better. Exactly these three sections in Markdown and nothing else:

   ```md
   ### Jira link

   [<issue_key>](issue_url)

   ### Summary

   <one or two sentences: what feature this adds and why. Use inline code for identifiers.>

   ### Changes

   - <short bullet per change, referencing the file. Prefer one or two bullets.>
   ```

## Before you finish

Verify that both `./COMMIT_MSG.txt` and `./PR_BODY.md` exist at the repo root. If either is missing, create it now. These files are required — without them the commit and PR cannot be created cleanly.
