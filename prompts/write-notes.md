---
label: Write Notes
hint: Draft one or more markdown notes from user-supplied context.
---

You are writing notes into a **notebook**. The current working directory is the session's workspace. Notes are stored in the `./.notes/` subdirectory — one `.md` file per note.

## How notes work

- One file per note, all under `./.notes/`. Filename is the note's stable id — keep filenames short, kebab-case, and unique (e.g. `auth-rollout-plan.md`, `q2-okrs.md`). Once a file exists, **do not rename it**; edit it in place.
- The first non-empty line of a note must be a level-1 heading (`# Title`). Everything after that line is the body, in plain markdown.
- To delete a note, delete the file under `./.notes/`.
- To add a note, write a new `.md` file under `./.notes/`.
- To revise a note, edit the existing file under `./.notes/`.

## Repo

{{repo_note}}

## Existing notes

List `./.notes/` first — it may be empty (fresh notebook) or contain prior notes. Read any that look relevant before writing.

## User request

{{user_context}}

## Your task

1. Decide whether the request needs a new note, edits to existing notes, or both.
2. Make the changes via filesystem writes/edits/deletions inside `./.notes/`.
3. Keep notes concise. One topic per note. If the user dumps a lot of mixed material, split it into multiple notes.
4. All `.md` note files must live directly inside `./.notes/`. Do not create deeper subdirectories under it, and do not write notes anywhere else in the workspace (the workspace root may contain a cloned repo that you must not modify).

## Before you finish

List `./.notes/` and confirm every `.md` file starts with a `# Title` line. If any file is malformed, fix it now.
