import { SourceSwitcher } from '@/components/SourceSwitcher';
import { SourceTabs } from '@/components/SourceTabs';
import { SyncAllButton } from '@/components/SyncAllButton';
import { Outlet } from 'react-router';

export function SourcePage() {
  return (
    <div className='flex h-dvh flex-col'>
      <header className='h-header flex items-center gap-2 border-b bg-white px-4'>
        <SourceSwitcher />
        <SourceTabs />
        <SyncAllButton />
      </header>
      <Outlet />
    </div>
  );
}
