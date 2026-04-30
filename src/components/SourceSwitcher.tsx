import { TYPE_LOGO } from '@/components/typeLogo';
import { api, type ItemType } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Menu } from '@base-ui/react/menu';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { Link } from 'react-router';

export function SourceSwitcher() {
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const [currentSourceId, setCurrentSourceId] = useQueryState('source', parseAsInteger);
  const current = sources.find(s => s.id === currentSourceId) ?? null;

  return (
    <Menu.Root>
      <Menu.Trigger aria-label='Switch source' className={cn('btn-md btn-ghost', 'data-popup-open:bg-gray-100')}>
        {current ? (
          <SourceLabel type={current.type} externalId={current.external_id} />
        ) : (
          <span className='truncate'>Select source</span>
        )}
        <ChevronsUpDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4}>
          <Menu.Popup className='popup'>
            {sources.length === 0 ? (
              <div className='px-3 py-1.5 text-gray-500'>No sources</div>
            ) : (
              <Menu.Group>
                <Menu.GroupLabel className='menu-group-label'>Sources</Menu.GroupLabel>
                {sources.map(s => (
                  <Menu.Item key={s.id} onClick={() => setCurrentSourceId(s.id)} className='menu-item justify-between'>
                    <SourceLabel type={s.type} externalId={s.external_id} />
                    {s.id === currentSourceId && <Check className='text-indigo-600' />}
                  </Menu.Item>
                ))}
              </Menu.Group>
            )}
            {sources.length > 0 && <Menu.Separator className='menu-separator' />}
            <Menu.Group>
              <Menu.Item render={<Link to='/sources/add' />} className='menu-item'>
                <Plus />
                <span>Add source</span>
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function SourceLabel({ type, externalId }: { type: ItemType; externalId: string }) {
  const logo = TYPE_LOGO[type];
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <img src={logo.src} alt={logo.alt} className='size-4 shrink-0' />
      <span className='truncate'>{externalId}</span>
    </span>
  );
}
