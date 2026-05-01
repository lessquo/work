# CLAUDE.md

This is a personal local only app. Keep clean code and prefer refactoring.

## Dependencies

- `@base-ui/react`: Basic UI components.
- `@tanstack/react-pacer`: Debouncing.
- `@tanstack/react-query`: Data fetching. Prefer `useSuspenseQuery` over `useQuery`.
- `fuse.js`: Fuzzy search.
- `lucide-react`: Icons library. Default styles are defined in `src/index.css` as class `.lucide`. Override default styles only when it's necessary.
- `nuqs`: Search params state management.
- `react-hook-form`: Form handling.
- `react-router`: Prefer `<Link>`, `<NavLink>`, or `<Navigate>` over `useNavigate`.

## `src/components/ui`

- [ConfirmDialog](src/components/ui/ConfirmDialog.tsx) and [ConfirmDialog.lib](src/components/ui/ConfirmDialog.lib.ts)
- [Input](src/components/ui/Input.tsx)
- [Select](src/components/ui/Select.tsx)
- [Tabs](src/components/ui/Tabs.tsx)
- [Toast](src/components/ui/Toast.tsx) and [Toast.lib](src/components/ui/Toast.lib.ts)
- [Tooltip](src/components/ui/Tooltip.tsx) and [Tooltip.lib](src/components/ui/Tooltip.lib.ts)

## `src/lib`

- [cn](src/lib/cn.ts): This exports `twMerge` as `cn`
- [time](src/lib/time.ts): Time utils

## CSS utility classes

- `btn-ghost`: Use for icon-only buttons or when small buttons are placed close together.
- `btn-neutral`: Default button style.
- `btn-primary`: Use for actions that create external resources (GitHub PRs, Jira issues) or kick off long-running tasks.
