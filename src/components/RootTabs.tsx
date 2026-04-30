import { TabsList, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { Box, Database, Settings, Terminal, Workflow } from 'lucide-react';
import { useLocation, useMatch, useNavigate } from 'react-router';

export function RootTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const sourceMatch = useMatch('/sources/:sourceId/:tab/*');

  if (!location.pathname.startsWith('/sources')) return null;

  const base = sourceMatch ? `/sources/${sourceMatch.params.sourceId}` : null;
  const active = sourceMatch ? `${base}/${sourceMatch.params.tab}` : '/sources-list';

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
            <TabsTab value={`${base}/flows`}>
              <Workflow />
              Flows
            </TabsTab>
            <TabsTab value={`${base}/settings`}>
              <Settings />
              Settings
            </TabsTab>
          </>
        )}
      </TabsList>
    </TabsRoot>
  );
}
