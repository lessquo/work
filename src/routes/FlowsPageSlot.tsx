import { FlowPanel } from '@/components/flows/FlowPanel';
import { ItemPanel } from '@/components/items/ItemPanel';
import { NotePanel } from '@/components/items/NotePanel';
import { SessionPanel } from '@/components/sessions/SessionPanel';
import { useNumberParam } from '@/lib/useNumberParam';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';

export function FlowsPageSlot() {
  const flowId = useNumberParam('flowId');
  const [itemId] = useQueryState('item', parseAsInteger);
  const [sessionId, setSessionId] = useQueryState('session', parseAsInteger);
  const [noteId] = useQueryState('note', parseAsInteger);
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['setup', 'logs', 'diff', 'pr', 'notes'] as const).withDefault('logs'),
  );
  const [descriptionMode, setDescriptionMode] = useQueryState(
    'descriptionMode',
    parseAsStringLiteral(['edit', 'preview'] as const).withDefault('preview'),
  );

  if (itemId !== null) {
    return <ItemPanel itemId={itemId} isFlowMode />;
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

  if (noteId !== null) {
    return <NotePanel key={noteId} noteId={noteId} />;
  }

  if (flowId) return <FlowPanel />;

  return null;
}
