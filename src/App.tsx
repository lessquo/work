import { AddSourcePage } from '@/routes/AddSourcePage';
import { ItemsPage } from '@/routes/ItemsPage';
import { ItemsPageSlot } from '@/routes/ItemsPageSlot';
import { SessionsPage } from '@/routes/SessionsPage';
import { SettingsPage } from '@/routes/SettingsPage';
import { SourceIndexPage } from '@/routes/SourceIndexPage';
import { SourcePage } from '@/routes/SourcePage';
import { WorkflowsPage } from '@/routes/WorkflowsPage';
import { Navigate, Route, Routes } from 'react-router';
import { SessionsPageSlot } from './routes/SessionsPageSlot';
import { WorkflowsPageSlot } from './routes/WorkflowsPageSlot';

export function App() {
  return (
    <div className='flex min-h-screen flex-col'>
      <Routes>
        <Route index element={<Navigate to='/sources' replace />} />
        <Route path='/sources'>
          <Route index element={<SourceIndexPage />} />
          <Route path='add' element={<AddSourcePage />} />
          <Route path=':sourceId' element={<SourcePage />}>
            <Route index element={<Navigate to='items' replace />} />
            <Route path='items' element={<ItemsPage />}>
              <Route path=':itemId' element={<ItemsPageSlot />} />
            </Route>
            <Route path='sessions' element={<SessionsPage />}>
              <Route path=':sessionId' element={<SessionsPageSlot />} />
            </Route>
            <Route path='workflows' element={<WorkflowsPage />}>
              <Route path=':workflowId' element={<WorkflowsPageSlot />} />
            </Route>
            <Route path='settings' element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </div>
  );
}
