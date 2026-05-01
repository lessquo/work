import { FlowPanel } from '@/components/flows/FlowPanel';
import { ItemPanel } from '@/components/items/ItemPanel';
import { SessionPanel } from '@/components/sessions/SessionPanel';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useParams } from 'react-router';

export function FlowsPageSlot() {
  const { flowId } = useParams();
  const [itemId] = useQueryState('item', parseAsInteger);
  const [sessionId, setSessionId] = useQueryState('session', parseAsInteger);
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['setup', 'logs', 'diff', 'pr', 'notes'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );

  if (itemId !== null) {
    return <ItemPanel itemId={itemId} />;
  }

  if (sessionId !== null) {
    return (
      <SessionPanel
        key={sessionId}
        sessionId={sessionId}
        onClose={() => setSessionId(null)}
        onDelete={() => {
          void setSessionId(null);
          void setSessionTab(null);
          void setDescriptionMode(null);
        }}
        tab={sessionTab}
        setTab={setSessionTab}
        descriptionMode={descriptionMode}
        setDescriptionMode={setDescriptionMode}
      />
    );
  }

  if (flowId) return <FlowPanel />;

  return null;
}
