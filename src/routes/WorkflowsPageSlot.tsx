import { ItemPanel } from '@/components/panels/ItemPanel';
import { SessionPanel } from '@/components/panels/SessionPanel';
import { WorkflowPanel } from '@/components/panels/WorkflowPanel';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useParams } from 'react-router';

export function WorkflowsPageSlot() {
  const { workflowId } = useParams();
  const [itemId] = useQueryState('item', parseAsInteger);
  const [sessionId, setSessionId] = useQueryState('session', parseAsInteger);
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['logs', 'diff', 'pr'] as const).withDefault('logs'),
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
        tab={sessionTab}
        setTab={setSessionTab}
        descriptionMode={descriptionMode}
        setDescriptionMode={setDescriptionMode}
      />
    );
  }

  if (workflowId) return <WorkflowPanel />;

  return null;
}
