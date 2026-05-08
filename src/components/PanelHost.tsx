import { ItemPanel } from '@/components/items/ItemPanel';
import { SessionPanel } from '@/components/session-panel/SessionPanel';
import { usePanel } from '@/lib/panel';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

export function PanelHost() {
  const [panel, setPanel] = usePanel();
  const [sessionTab, setSessionTab] = useQueryState(
    'sessionTab',
    parseAsStringLiteral(['setup', 'logs', 'diff', 'pr', 'plan'] as const).withDefault('logs'),
  );

  if (!panel) return null;

  if (panel.kind === 'item') {
    return (
      <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
        <ItemPanel itemId={panel.id} />
      </div>
    );
  }

  return (
    <div className='h-full min-w-0 flex-1 overflow-y-scroll'>
      <SessionPanel
        key={panel.id}
        sessionId={panel.id}
        onClose={() => setPanel(null)}
        onDelete={() => {
          void setPanel(null);
          void setSessionTab(null);
        }}
        tab={sessionTab}
        setTab={setSessionTab}
      />
    </div>
  );
}
