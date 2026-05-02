import { Outlet } from 'react-router';

export function RootLayout() {
  return (
    <div className='flex h-dvh flex-col'>
      <Outlet />
    </div>
  );
}
