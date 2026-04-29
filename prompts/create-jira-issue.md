---
label: Create Jira Issue
hint: Draft a Jira issue (title + description) from user-supplied context.
---

You are drafting a new Jira ticket for project `{{project_key}}`. Read the user's context below, then produce a concise ticket draft. Do not attempt to implement anything — only produce the draft files.

## Repo

{{repo_note}}

## Your tasks

1. Read the user's context below. Decide whether it's a bug, feature request, or chore.
2. Write `./JIRA_TITLE.txt` — required. One line. A concise, imperative-mood summary suitable as a Jira issue summary (e.g. `Crash when uploading > 100MB CSV`, not `we should fix the upload bug`). No trailing period. No quotes. Maximum ~90 characters.
3. Write `./JIRA_DESCRIPTION.md` — required. Markdown. Shorter is better. Use this format:

   ```md
   ### Context

   <one short paragraph: what problem this ticket addresses, who it affects, why now.>

   ### Requirements

   - <bullet — simple to-do style list>
   - <bullet>
   ```

## User context

{{user_context}}

## Before you finish

Verify that both `./JIRA_TITLE.txt` and `./JIRA_DESCRIPTION.md` exist at the workspace root. If either is missing, create it now. These files are required — without them the Jira ticket cannot be created.
