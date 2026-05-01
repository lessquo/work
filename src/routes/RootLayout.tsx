import { RootTabs } from '@/components/RootTabs';
import { Link, Outlet } from 'react-router';

export function RootLayout() {
  return (
    <div className='flex h-dvh flex-col'>
      <header className='h-header flex items-center gap-2 border-b bg-white px-4'>
        <Link to='/' className='font-semibold tracking-tight'>
          Work
        </Link>
        <RootTabs />
      </header>
      <Outlet />
    </div>
  );
}
