import { TabsList, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { Box, Settings, Terminal, Workflow } from 'lucide-react';
import { useMatch, useNavigate } from 'react-router';

export function RootTabs() {
  const navigate = useNavigate();
  const match = useMatch('/sources/:sourceId/:tab/*');
  if (!match) return null;
  const base = `/sources/${match.params.sourceId}`;
  const active = match.params.tab ? `${base}/${match.params.tab}` : '';
  return (
    <TabsRoot value={active} onValueChange={value => navigate(value as string)}>
      <TabsList className='-mb-px'>
        <TabsTab value={`${base}/items`}>
          <Box />
          Items
        </TabsTab>
        <TabsTab value={`${base}/sessions`}>
          <Terminal />
          Sessions
        </TabsTab>
        <TabsTab value={`${base}/flows`}>
          <Workflow />
          Flows
        </TabsTab>
        <TabsTab value={`${base}/settings`}>
          <Settings />
          Settings
        </TabsTab>
      </TabsList>
    </TabsRoot>
  );
}
