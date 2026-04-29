import { App } from '@/App';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { ToastViewport } from '@/components/ui/Toast';
import { ToastProvider } from '@/components/ui/Toast.lib';
import { TooltipProvider } from '@/components/ui/Tooltip.lib';
import '@/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NuqsAdapter>
          <TooltipProvider delay={150}>
            <ToastProvider>
              <ConfirmDialogProvider>
                <App />
                <ToastViewport />
              </ConfirmDialogProvider>
            </ToastProvider>
          </TooltipProvider>
        </NuqsAdapter>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
