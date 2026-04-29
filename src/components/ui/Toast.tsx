import { cn } from '@/lib/cn';
import { Toast as Base } from '@base-ui-components/react/toast';

export const ToastProvider = Base.Provider;
export const useToast = Base.useToastManager;

export function ToastViewport() {
  const manager = Base.useToastManager();
  return (
    <Base.Portal>
      <Base.Viewport
        className={cn(
          'pointer-events-none fixed right-4 bottom-4 flex w-88 max-w-[calc(100vw-2rem)] flex-col-reverse gap-2',
        )}
      >
        {manager.toasts.map(toast => (
          <Base.Root
            key={toast.id}
            toast={toast}
            className={cn(
              'pointer-events-auto rounded-md border px-3 py-2 text-xs shadow-md',
              toast.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : toast.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-800',
            )}
          >
            <div className='flex items-start gap-3'>
              <div className='min-w-0 flex-1'>
                {toast.title && <Base.Title className='font-medium' />}
                {toast.description && <Base.Description className='mt-0.5 text-[11px] opacity-90' />}
              </div>
              <Base.Close
                aria-label='close'
                className='-mt-0.5 -mr-1 shrink-0 rounded px-1 text-current opacity-60 hover:bg-black/10 hover:opacity-100'
              >
                ✕
              </Base.Close>
            </div>
          </Base.Root>
        ))}
      </Base.Viewport>
    </Base.Portal>
  );
}
