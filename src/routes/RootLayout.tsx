import { SourceSwitcher } from '@/components/SourceSwitcher';
import { RootTabs } from '@/components/RootTabs';
import { SyncAllButton } from '@/components/SyncAllButton';
import { Outlet } from 'react-router';

export function RootLayout() {
  return (
    <div className='flex h-dvh flex-col'>
      <header className='h-header flex items-center gap-2 border-b bg-white px-4'>
        <SourceSwitcher />
        <RootTabs />
        <SyncAllButton />
      </header>
      <Outlet />
    </div>
  );
}
