import { SessionPanel } from '@/components/sessions/SessionPanel';
import { useNumberParam } from '@/lib/router';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate } from 'react-router';

export function SessionsPageSlot() {
  const sessionId = useNumberParam('sessionId');
  const navigate = useNavigate();
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['setup', 'logs', 'diff', 'pr', 'markdown'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );

  if (sessionId === null) return null;

  return (
    <SessionPanel
      key={sessionId}
      sessionId={sessionId}
      onClose={() => navigate({ pathname: `/sessions`, search: window.location.search })}
      tab={sessionTab}
      setTab={setSessionTab}
      descriptionMode={descriptionMode}
      setDescriptionMode={setDescriptionMode}
    />
  );
}
