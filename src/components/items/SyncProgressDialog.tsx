import { TYPE_LOGO } from '@/components/typeLogo';
import { type Source } from '@/lib/api';
import { Dialog } from '@base-ui/react/dialog';
import { Check, Loader2, X } from 'lucide-react';

export type SyncProgressItem = {
  source: Source;
  phase: 'pending' | 'running' | 'succeeded' | 'failed';
  synced?: number;
  error?: string;
};

export type SyncProgressState = {
  status: 'running' | 'done';
  items: SyncProgressItem[];
};

export function SyncProgressDialog({ state, onClose }: { state: SyncProgressState | null; onClose: () => void }) {
  return (
    <Dialog.Root
      open={state !== null}
      onOpenChange={open => {
        if (!open && state?.status === 'done') onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 bg-black/30' />
        <Dialog.Popup className='fixed top-1/2 left-1/2 flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-white shadow-xl outline-none'>
          {state && <Body state={state} onClose={onClose} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ state, onClose }: { state: SyncProgressState; onClose: () => void }) {
  const running = state.status === 'running';
  const total = state.items.length;
  const succeeded = state.items.filter(i => i.phase === 'succeeded').length;
  const failed = state.items.filter(i => i.phase === 'failed').length;
  const finished = succeeded + failed;

  return (
    <>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <Dialog.Title className='text-base font-semibold'>{running ? 'Syncing items' : 'Sync complete'}</Dialog.Title>
        {!running && (
          <button onClick={onClose} className='btn-md btn-ghost' aria-label='close'>
            <X />
          </button>
        )}
      </div>

      <div className='border-b px-4 py-3'>
        {running ? (
          <>
            <div className='mb-1 text-sm text-gray-700'>
              {finished} of {total}
            </div>
            <div className='h-1.5 w-full overflow-hidden rounded-full bg-gray-100'>
              <div
                className='h-full bg-sky-500 transition-all'
                style={{ width: `${(finished / Math.max(total, 1)) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className='text-sm text-gray-700'>
            {succeeded} succeeded
            {failed > 0 && (
              <>
                , <span className='text-rose-700'>{failed} failed</span>
              </>
            )}
            .
          </div>
        )}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-2'>
        <ul className='flex flex-col'>
          {state.items.map(it => (
            <li key={it.source.id} className='flex items-start gap-2 border-b py-2 text-sm last:border-b-0'>
              <SourceLabel source={it.source} />
              <div className='ml-auto text-right text-xs'>
                <PhaseStatus item={it} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function PhaseStatus({ item }: { item: SyncProgressItem }) {
  switch (item.phase) {
    case 'pending':
      return <span className='text-gray-400'>Pending</span>;
    case 'running':
      return (
        <span className='inline-flex items-center gap-1 text-sky-700'>
          <Loader2 className='size-3.5 animate-spin' />
          Syncing…
        </span>
      );
    case 'succeeded':
      return (
        <span className='inline-flex items-center gap-1 text-emerald-700'>
          <Check className='size-3.5' />
          {item.synced} synced
        </span>
      );
    case 'failed':
      return (
        <span className='text-rose-700' title={item.error}>
          Failed
        </span>
      );
  }
}

function SourceLabel({ source }: { source: Source }) {
  const logo = TYPE_LOGO[source.type];
  return (
    <span className='inline-flex min-w-0 items-center gap-1.5'>
      <img src={logo.src} alt={logo.alt} className='size-3.5 shrink-0' />
      <span className='truncate'>{source.external_id}</span>
    </span>
  );
}
