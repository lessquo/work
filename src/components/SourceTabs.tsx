import { TabsList, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { Box, Settings, Terminal, Workflow } from 'lucide-react';
import { useMatch, useNavigate, useParams } from 'react-router';

export function SourceTabs() {
  const { sourceId } = useParams();
  const navigate = useNavigate();
  const base = `/sources/${sourceId}`;
  const match = useMatch('/sources/:sourceId/:tab/*');
  const active = match?.params.tab ? `${base}/${match.params.tab}` : '';
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
