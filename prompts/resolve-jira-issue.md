---
label: Resolve Jira Issue
hint: Make the change described in the Jira issue — fix, feature, refactor, etc.
applies_to: github_pr
---

## Issue

{{user_context}}

## Your tasks

1. Fetch the full Jira issue (description, comments, attachments metadata) via the Atlassian MCP before investigating. If you find Slack thread links, fetch them as well.
2. Investigate the relevant file(s) — for a bug, identify the root cause; for a feature or refactor, understand the existing code and conventions and the right place to make the change. Use context7 MCP for libraries best practice.
3. Edit — make the change. For a bug, prefer the minimal fix. (or, if unsure, write `./CLAUDE_NOTES.md` instead). Don't leave comments unless they're necessary.
4. Write `./COMMIT_MSG.txt` — required. One line, maximum 72 characters, Conventional Commits format `<type>(<area>): <subject>`. Pick `<type>` (`fix`, `feat`, `refactor`, `test`, `chore`, `ui`, `ci`, `docs`, `perf`) based on the nature of the change. `<area>` is a short identifier for the changed module/file (e.g. `serializer`, `auth`, `webhook`). The subject must be imperative mood (`null check on user id`, not `fixed null check`), no trailing period, no quotes. Examples: `fix(serializer): null check on user id`, `feat(reports): add csv export`, `refactor(auth): extract token parser`. The worker uses the first line of this file as the git commit subject and PR title.
5. Write `./PR_BODY.md` — required. Shorter is better. Exactly these three sections in Markdown and nothing else:

   ```md
   ### Jira link

   [<issue_key>](issue_url)

   ### Summary

   <one or two sentences: what this change does and why. Use inline code for identifiers.>

   ### Changes

   - <short bullet per change, referencing the file. Prefer one or two bullets.>
   ```

## Before you finish

Verify that both `./COMMIT_MSG.txt` and `./PR_BODY.md` exist at the repo root. If either is missing, create it now. These files are required — without them the commit and PR cannot be created cleanly.
