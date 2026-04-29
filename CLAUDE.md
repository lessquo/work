# CLAUDE.md

This is a personal local only app. Keep clean code and prefer refactoring.

## DB Migration

- Always remove migration code after execution.

## Dependencies

- `@base-ui-components/react`: Basic UI components.
- `@tanstack/react-pacer`: Debouncing.
- `@tanstack/react-query`: Data fetching. Prefer `useSuspenseQuery` over `useQuery`.
- `fuse.js`: Fuzzy search.
- `lucide-react`: Icons library. Default styles are defined in `src/index.css` as class `.lucide`. Override default styles only when it's necessary.
- `nuqs`: Search params state management.
- `react-hook-form`: Form handling.
- `react-router`: Prefer `<Link>`, `<NavLink>`, or `<Navigate>` over `useNavigate`.

## `lib` folder

- [cn](src/lib/cn.ts): This exports `twMerge` as `cn`
- [time](src/lib/time.ts): Time utils
