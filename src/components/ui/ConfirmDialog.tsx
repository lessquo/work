import { ConfirmDialogContext, type ConfirmFn, type ConfirmOptions } from '@/components/ui/ConfirmDialog.lib';
import { cn } from '@/lib/cn';
import { Dialog as Base } from '@base-ui/react/dialog';
import { useCallback, useRef, useState } from 'react';

type State = { opts: ConfirmOptions; resolve: (v: boolean) => void };

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const settledRef = useRef(false);

  const confirm = useCallback<ConfirmFn>(opts => {
    return new Promise<boolean>(resolve => {
      settledRef.current = false;
      setState({ opts, resolve });
    });
  }, []);

  function settle(value: boolean) {
    if (settledRef.current) return;
    settledRef.current = true;
    state?.resolve(value);
    setState(null);
  }

  return (
    <ConfirmDialogContext value={confirm}>
      {children}
      <Base.Root
        open={state !== null}
        onOpenChange={open => {
          if (!open) settle(false);
        }}
      >
        <Base.Portal>
          <Base.Backdrop className='fixed inset-0 bg-black/30' />
          <Base.Popup className='fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-5 shadow-xl outline-none'>
            <Base.Title className='text-base font-semibold'>{state?.opts.title ?? ''}</Base.Title>
            {state?.opts.description && (
              <Base.Description className='mt-1.5 text-sm text-gray-600'>{state.opts.description}</Base.Description>
            )}
            <div className='mt-5 flex justify-end gap-2'>
              <Base.Close className='btn-md btn-neutral'>{state?.opts.cancelText ?? 'Cancel'}</Base.Close>
              <button
                onClick={() => settle(true)}
                autoFocus
                className={cn('btn-md', state?.opts.destructive ? 'btn-danger' : 'btn-primary')}
              >
                {state?.opts.confirmText ?? 'Confirm'}
              </button>
            </div>
          </Base.Popup>
        </Base.Portal>
      </Base.Root>
    </ConfirmDialogContext>
  );
}
