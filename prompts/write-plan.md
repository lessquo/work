---
label: Write Plan
hint: Draft a single markdown plan from user-supplied context.
applies_to: plan
---

You are writing or revising one or more plans in `./plan.md`. Each plan should describe what needs to be done, along with brief context. Don't include implementation details.

## Rules

- Write to `./plan.md` (it may already exist with prior content).
- The first non-empty line must be a level-1 heading (e.g. `# Enable ESLint rules`).
- Long plans should be broken into multiple sections. Each section must start with a level-2 heading (e.g. `## Enable no-var ESList rule`). List plans in recommended execution order.
- All headings should be short and imperative.
- Keep each section under 1000 characters.

## Repo

{{repo_note}}

## User request

{{user_context}}

## Before you finish

Read `./plan.md` and confirm it starts with a `# ` heading. If it's malformed, fix it now.
