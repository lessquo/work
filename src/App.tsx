import { AddSourcePage } from '@/routes/AddSourcePage';
import { FlowsPage } from '@/routes/FlowsPage';
import { ItemsPage } from '@/routes/ItemsPage';
import { ItemsPageSlot } from '@/routes/ItemsPageSlot';
import { RootLayout } from '@/routes/RootLayout';
import { SessionsPage } from '@/routes/SessionsPage';
import { SettingsPage } from '@/routes/SettingsPage';
import { SourcesPage } from '@/routes/SourcesPage';
import { Navigate, Route, Routes } from 'react-router';
import { FlowsPageSlot } from './routes/FlowsPageSlot';
import { SessionsPageSlot } from './routes/SessionsPageSlot';

export function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to='/sources' replace />} />
        <Route path='/sources' element={<SourcesPage />} />
        <Route path='/sources/add' element={<AddSourcePage />} />
        <Route path='/items' element={<ItemsPage />}>
          <Route path=':itemId' element={<ItemsPageSlot />} />
        </Route>
        <Route path='/sessions' element={<SessionsPage />}>
          <Route path=':sessionId' element={<SessionsPageSlot />} />
        </Route>
        <Route path='/flows' element={<FlowsPage />}>
          <Route path=':flowId' element={<FlowsPageSlot />} />
        </Route>
        <Route path='/settings' element={<SettingsPage />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Route>
    </Routes>
  );
}
