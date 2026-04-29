import { createContext, useContext } from 'react';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmDialogContext);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmDialogProvider>');
  return fn;
}
