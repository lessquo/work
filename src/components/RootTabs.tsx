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

  function navigateToTab(path: string) {
    const source = new URLSearchParams(location.search).get('source');
    navigate({ pathname: path, search: source ? `?source=${source}` : '' });
  }

  return (
    <TabsRoot value={active} onValueChange={value => navigateToTab(value as string)}>
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
