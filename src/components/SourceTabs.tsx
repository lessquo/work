import { Tabs } from '@/components/ui/Tabs';
import { List, Settings, Terminal, Workflow } from 'lucide-react';
import { useMatch, useNavigate, useParams } from 'react-router';

export function SourceTabs() {
  const { sourceId } = useParams();
  const navigate = useNavigate();
  const base = `/sources/${sourceId}`;
  const match = useMatch('/sources/:sourceId/:tab/*');
  const active = match?.params.tab ? `${base}/${match.params.tab}` : '';
  return (
    <Tabs.Root value={active} onValueChange={value => navigate(value as string)}>
      <Tabs.List className='-mb-px'>
        <Tabs.Tab value={`${base}/items`}>
          <List />
          Items
        </Tabs.Tab>
        <Tabs.Tab value={`${base}/sessions`}>
          <Terminal />
          Sessions
        </Tabs.Tab>
        <Tabs.Tab value={`${base}/workflows`}>
          <Workflow />
          Workflows
        </Tabs.Tab>
        <Tabs.Tab value={`${base}/settings`}>
          <Settings />
          Settings
        </Tabs.Tab>
      </Tabs.List>
    </Tabs.Root>
  );
}
