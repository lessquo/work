import { cn } from '@/lib/cn';
import { Menu } from '@base-ui/react/menu';
import { Box, Check, ChevronsUpDown, Database, Settings, Terminal, Workflow, type LucideIcon } from 'lucide-react';
import { Link, useMatch } from 'react-router';

const PAGES = [
  { path: '/sources', icon: Database, label: 'Sources' },
  { path: '/items', icon: Box, label: 'Items' },
  { path: '/sessions', icon: Terminal, label: 'Sessions' },
  { path: '/flows', icon: Workflow, label: 'Flows' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function PageSwitcher() {
  const match = useMatch('/:tab/*');
  const activePath = match ? `/${match.params.tab}` : '';
  const current = PAGES.find(p => p.path === activePath) ?? null;

  return (
    <Menu.Root>
      <Menu.Trigger aria-label='Switch page' className={cn('btn-md btn-ghost', 'data-popup-open:bg-gray-100')}>
        {current ? (
          <PageLabel icon={current.icon} label={current.label} />
        ) : (
          <span className='truncate'>Select page</span>
        )}
        <ChevronsUpDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4}>
          <Menu.Popup className='popup'>
            <Menu.Group>
              <Menu.GroupLabel className='menu-group-label'>Pages</Menu.GroupLabel>
              {PAGES.map(p => (
                <Menu.Item key={p.path} render={<Link to={p.path} />} className='menu-item justify-between'>
                  <PageLabel icon={p.icon} label={p.label} />
                  {p.path === activePath && <Check className='text-indigo-600' />}
                </Menu.Item>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function PageLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <Icon />
      <span className='truncate'>{label}</span>
    </span>
  );
}
