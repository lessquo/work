import { SessionPanel } from '@/components/panels/SessionPanel';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useNavigate, useParams } from 'react-router';

export function SessionsPageSlot() {
  const { sourceId, sessionId } = useParams();
  const navigate = useNavigate();
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['logs', 'diff', 'pr'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );

  if (!sessionId) return null;

  return (
    <SessionPanel
      sessionId={Number(sessionId)}
      onClose={() =>
        navigate({ pathname: `/sources/${sourceId}/sessions`, search: window.location.search })
      }
      tab={sessionTab}
      setTab={setSessionTab}
      descriptionMode={descriptionMode}
      setDescriptionMode={setDescriptionMode}
    />
  );
}
