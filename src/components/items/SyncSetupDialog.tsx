import { TYPE_LOGO } from '@/components/typeLogo';
import { Input } from '@/components/ui/Input';
import { api, type Source } from '@/lib/api';
import { Dialog } from '@base-ui/react/dialog';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

const SYNC_LIMIT_MIN = 1;
const SYNC_LIMIT_MAX = 10000;

export function SyncSetupDialog({
  open,
  onOpenChange,
  title,
  description,
  startLabel,
  onStart,
  sources,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  startLabel: string;
  onStart: (selectedSourceIds: number[]) => void;
  sources?: Source[];
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
              sources={sources}
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
  sources,
}: {
  title: string;
  description?: string;
  startLabel: string;
  onStart: (selectedSourceIds: number[]) => void;
  onClose: () => void;
  sources?: Source[];
}) {
  const qc = useQueryClient();
  const { data: settings } = useSuspenseQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [limit, setLimit] = useState<number>(settings.sync_limit);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(sources?.map(s => s.id) ?? []));

  const saveMutation = useMutation({
    mutationFn: (n: number) => api.updateSettings({ sync_limit: n }),
    onSuccess: s => {
      qc.setQueryData(['settings'], s);
    },
  });

  const clamped = Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, Math.floor(limit || 0)));
  const valid = Number.isFinite(limit) && clamped === Math.floor(limit) && limit >= SYNC_LIMIT_MIN;
  const dirty = clamped !== settings.sync_limit;
  const hasSelection = !sources || selectedIds.size > 0;
  const allChecked = sources ? sources.every(s => selectedIds.has(s.id)) : false;

  function toggleSource(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!sources) return;
    setSelectedIds(allChecked ? new Set() : new Set(sources.map(s => s.id)));
  }

  async function handleStart() {
    if (!valid || !hasSelection) return;
    if (dirty) {
      await saveMutation.mutateAsync(clamped);
    }
    onStart(Array.from(selectedIds));
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

        {sources && sources.length > 0 && (
          <div className='flex flex-col gap-1'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-gray-700'>Sources</span>
              <button type='button' onClick={toggleAll} className='text-xs text-sky-700 hover:underline'>
                {allChecked ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <ul className='flex max-h-60 flex-col overflow-y-auto rounded-md border border-gray-200'>
              {sources.map(s => {
                const logo = TYPE_LOGO[s.type];
                return (
                  <li key={s.id} className='border-b last:border-b-0'>
                    <label className='flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50'>
                      <input
                        type='checkbox'
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSource(s.id)}
                        className='size-4 shrink-0'
                      />
                      <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
                      <span className='min-w-0 truncate'>{s.external_id}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <label className='flex flex-col gap-1'>
          <span className='text-sm font-medium text-gray-700'>
            Max items per source{' '}
            <span className='ml-2 font-normal text-gray-400'>
              between {SYNC_LIMIT_MIN} and {SYNC_LIMIT_MAX}
            </span>
          </span>
          <Input
            type='number'
            min={SYNC_LIMIT_MIN}
            max={SYNC_LIMIT_MAX}
            step={100}
            value={Number.isFinite(limit) ? limit : ''}
            onChange={e => setLimit(Number(e.target.value))}
            className='font-mono'
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
          disabled={!valid || !hasSelection || saveMutation.isPending}
          className='btn-md btn-primary'
        >
          {saveMutation.isPending ? 'Saving…' : startLabel}
        </button>
      </div>
    </>
  );
}
