---
label: Write Plans
hint: Draft one or more markdown notes from user-supplied context.
applies_to: notes
---

You are writing plans across multiple Markdown files — one .md file per plan. Each plan should describe what needs to be done, along with brief context. Don't include implementation details.

## Rules

- All plan files should be stored in `./.notes/`.
- Filename should be short, imperative, kebab-case, with a number prefix (e.g. `01-enable-no-var-eslint-rule.md`).
- The first non-empty line of a file must be a level-1 heading (e.g. `# 01 Enable `no var` ESList rule`).
- Body: Max 1000 characters.

## Repo

{{repo_note}}

## User request

{{user_context}}

## Before you finish

List `./.notes/` and confirm every `.md` file starts with a title line. If any file is malformed, fix it now.
