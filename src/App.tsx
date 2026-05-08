import { FlowsPage } from '@/routes/FlowsPage';
import { ItemsPage } from '@/routes/ItemsPage';
import { RootLayout } from '@/routes/RootLayout';
import { SessionsPage } from '@/routes/SessionsPage';
import { SettingsPage } from '@/routes/SettingsPage';
import { SourcesPage } from '@/routes/SourcesPage';
import { Navigate, Route, Routes } from 'react-router';

export function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to='/sources' replace />} />
        <Route path='/sources' element={<SourcesPage />} />
        <Route path='/items' element={<ItemsPage />} />
        <Route path='/sessions' element={<SessionsPage />} />
        <Route path='/flows' element={<FlowsPage />} />
        <Route path='/settings' element={<SettingsPage />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Route>
    </Routes>
  );
}
