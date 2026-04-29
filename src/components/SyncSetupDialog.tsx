import { api } from '@/lib/api';
import { Dialog } from '@base-ui-components/react/dialog';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const SYNC_LIMIT_MIN = 1;
const SYNC_LIMIT_MAX = 10000;

export function SyncSetupDialog({
  open,
  onOpenChange,
  title,
  description,
  startLabel,
  onStart,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  startLabel: string;
  onStart: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 bg-black/30' />
        <Dialog.Popup className='fixed top-1/2 left-1/2 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-white shadow-xl outline-none'>
          {open && (
            <Body
              title={title}
              description={description}
              startLabel={startLabel}
              onStart={onStart}
              onClose={() => onOpenChange(false)}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({
  title,
  description,
  startLabel,
  onStart,
  onClose,
}: {
  title: string;
  description?: string;
  startLabel: string;
  onStart: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: settings } = useSuspenseQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [limit, setLimit] = useState<number>(settings.sync_limit);

  useEffect(() => {
    setLimit(settings.sync_limit);
  }, [settings.sync_limit]);

  const saveMutation = useMutation({
    mutationFn: (n: number) => api.updateSettings({ sync_limit: n }),
    onSuccess: s => {
      qc.setQueryData(['settings'], s);
    },
  });

  const clamped = Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, Math.floor(limit || 0)));
  const valid = Number.isFinite(limit) && clamped === Math.floor(limit) && limit >= SYNC_LIMIT_MIN;
  const dirty = clamped !== settings.sync_limit;

  async function handleStart() {
    if (!valid) return;
    if (dirty) {
      await saveMutation.mutateAsync(clamped);
    }
    onStart();
  }

  return (
    <>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <Dialog.Title className='text-base font-semibold'>{title}</Dialog.Title>
        <button onClick={onClose} className='btn-md btn-ghost' aria-label='close'>
          <X />
        </button>
      </div>

      <div className='flex flex-col gap-3 px-4 py-4'>
        {description && <p className='text-sm text-gray-600'>{description}</p>}

        <label className='flex flex-col gap-1'>
          <span className='text-sm font-medium text-gray-700'>
            Max items per source{' '}
            <span className='ml-2 font-normal text-gray-400'>
              between {SYNC_LIMIT_MIN} and {SYNC_LIMIT_MAX}
            </span>
          </span>
          <input
            type='number'
            min={SYNC_LIMIT_MIN}
            max={SYNC_LIMIT_MAX}
            step={100}
            value={Number.isFinite(limit) ? limit : ''}
            onChange={e => setLimit(Number(e.target.value))}
            className='rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none'
            autoFocus
          />
          <span className='text-xs text-gray-500'>Saved as your default for next time. Higher values take longer.</span>
        </label>
      </div>

      <div className='flex items-center justify-end gap-2 border-t px-4 py-3'>
        <button onClick={onClose} className='btn-md btn-secondary'>
          Cancel
        </button>
        <button
          type='button'
          onClick={handleStart}
          disabled={!valid || saveMutation.isPending}
          className='btn-md btn-primary'
        >
          {saveMutation.isPending ? 'Saving…' : startLabel}
        </button>
      </div>
    </>
  );
}
