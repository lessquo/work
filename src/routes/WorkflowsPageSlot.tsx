import { ItemPanel } from '@/components/panels/ItemPanel';
import { SessionPanel } from '@/components/panels/SessionPanel';
import { WorkflowPanel } from '@/components/panels/WorkflowPanel';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useParams } from 'react-router';

export function WorkflowsPageSlot() {
  const { workflowId } = useParams();
  const [openItemId] = useQueryState('item', parseAsInteger);
  const [openSessionId, setOpenSessionId] = useQueryState('session', parseAsInteger);
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['logs', 'diff', 'pr'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );

  if (openItemId !== null) {
    return <ItemPanel itemId={openItemId} />;
  }

  if (openSessionId !== null) {
    return (
      <SessionPanel
        sessionId={openSessionId}
        onClose={() => setOpenSessionId(null)}
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
