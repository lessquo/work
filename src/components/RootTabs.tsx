import { TabsList, TabsRoot, TabsTab } from '@/components/ui/Tabs';
import { Box, Database, Settings, Terminal, Workflow } from 'lucide-react';
import { useLocation, useMatch, useNavigate } from 'react-router';

const TABS = [
  { path: '/sources', icon: Database, label: 'Sources' },
  { path: '/items', icon: Box, label: 'Items' },
  { path: '/sessions', icon: Terminal, label: 'Sessions' },
  { path: '/flows', icon: Workflow, label: 'Flows' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function RootTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch('/:tab/*');
  const active = match ? `/${match.params.tab}` : '';

  return (
    <TabsRoot value={active} onValueChange={value => navigate({ pathname: value as string, search: location.search })}>
      <TabsList className='-mb-px'>
        {TABS.map(({ path, icon: Icon, label }) => (
          <TabsTab key={path} value={path}>
            <Icon />
            {label}
          </TabsTab>
        ))}
      </TabsList>
    </TabsRoot>
  );
}
