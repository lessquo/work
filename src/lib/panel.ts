import { createSerializer, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';

export type PanelKind = 'item' | 'session';
export type Panel = { kind: PanelKind; id: number };

const RE = /^(item|session)-(\d+)$/;

export function parsePanel(raw: string | null): Panel | null {
  if (!raw) return null;
  const m = RE.exec(raw);
  return m ? { kind: m[1] as PanelKind, id: Number(m[2]) } : null;
}

export function formatPanel(panel: Panel | null): string | null {
  return panel ? `${panel.kind}-${panel.id}` : null;
}

export const SESSION_TABS = ['setup', 'logs', 'diff', 'pr', 'plan'] as const;

const carryParsers = {
  panel: parseAsString,
  sessionTab: parseAsStringLiteral(SESSION_TABS),
};

const serializeCarry = createSerializer(carryParsers);

export function usePanel() {
  const [raw, setRaw] = useQueryState('panel', parseAsString);
  return [parsePanel(raw), (next: Panel | null) => setRaw(formatPanel(next))] as const;
}

export function usePanelLink() {
  const [panel] = useQueryState('panel', parseAsString);
  const [sessionTab] = useQueryState('sessionTab', parseAsStringLiteral(SESSION_TABS));
  return (pathname: string, overrides?: { panel?: Panel | null }) =>
    serializeCarry(pathname, {
      panel: overrides && 'panel' in overrides ? formatPanel(overrides.panel ?? null) : panel,
      sessionTab,
    });
}
