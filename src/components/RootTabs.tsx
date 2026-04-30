import { TabsList, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { Box, Database, Settings, Terminal, Workflow } from 'lucide-react';
import { useMatch, useNavigate } from 'react-router';

export function RootTabs() {
  const navigate = useNavigate();
  const sourceMatch = useMatch('/sources/:sourceId/:tab/*');
  const sourcesListMatch = useMatch('/sources-list');
  const flowsMatch = useMatch('/flows/*');
  const settingsMatch = useMatch('/settings');

  const base = sourceMatch ? `/sources/${sourceMatch.params.sourceId}` : null;
  const active = sourceMatch
    ? `${base}/${sourceMatch.params.tab}`
    : settingsMatch
      ? '/settings'
      : flowsMatch
        ? '/flows'
        : sourcesListMatch
          ? '/sources-list'
          : '';

  return (
    <TabsRoot value={active} onValueChange={value => navigate(value as string)}>
      <TabsList className='-mb-px'>
        <TabsTab value='/sources-list'>
          <Database />
          Sources
        </TabsTab>
        {base && (
          <>
            <TabsTab value={`${base}/items`}>
              <Box />
              Items
            </TabsTab>
            <TabsTab value={`${base}/sessions`}>
              <Terminal />
              Sessions
            </TabsTab>
          </>
        )}
        <TabsTab value='/flows'>
          <Workflow />
          Flows
        </TabsTab>
        <TabsTab value='/settings'>
          <Settings />
          Settings
        </TabsTab>
      </TabsList>
    </TabsRoot>
  );
}
