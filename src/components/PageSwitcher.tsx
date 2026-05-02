import { cn } from '@/lib/cn';
import { Menu } from '@base-ui/react/menu';
import { Box, Check, ChevronsUpDown, Database, Settings, Terminal, Workflow } from 'lucide-react';
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
      <Menu.Trigger
        aria-label='Switch page'
        className={cn('btn-md btn-ghost text-lg font-semibold', 'data-popup-open:bg-gray-100')}
      >
        <span className='truncate'>{current?.label ?? 'Select page'}</span>
        <ChevronsUpDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4}>
          <Menu.Popup className='popup min-w-41'>
            {PAGES.map(p => (
              <Menu.Item key={p.path} render={<Link to={p.path} />} className='menu-item justify-between'>
                <span className='flex min-w-0 items-center gap-2'>
                  <p.icon />
                  <span className='truncate'>{p.label}</span>
                </span>
                {p.path === activePath && <Check className='text-indigo-600' />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
