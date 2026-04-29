import { SyncSetupDialog } from '@/components/SyncSetupDialog';
import { TYPE_LOGO } from '@/components/typeLogo';
import { api, type Source } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Dialog } from '@base-ui/react/dialog';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

type Result = { source: Source; ok: boolean; synced?: number; error?: string };
type State = {
  status: 'running' | 'done';
  current: number;
  total: number;
  currentSource?: Source;
  results: Result[];
};

export function SyncAllButton() {
  const qc = useQueryClient();
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const [state, setState] = useState<State | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  async function syncAll() {
    if (sources.length === 0) return;
    setState({ status: 'running', current: 0, total: sources.length, results: [] });
    const results: Result[] = [];
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      setState({ status: 'running', current: i + 1, total: sources.length, currentSource: source, results });
      try {
        const { synced } = await api.syncSource(source.id);
        results.push({ source, ok: true, synced });
      } catch (e) {
        results.push({ source, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setState({ status: 'done', current: sources.length, total: sources.length, results });
    qc.invalidateQueries({ queryKey: ['items'] });
  }

  return (
    <>
      <button
        type='button'
        onClick={() => setSetupOpen(true)}
        disabled={sources.length === 0 || state?.status === 'running'}
        className='btn-md btn-secondary ml-auto'
      >
        <RefreshCw className={cn('size-3.5', state?.status === 'running' && 'animate-spin')} />
        Sync all
      </button>

      <SyncSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        title={`Sync all ${sources.length} source${sources.length === 1 ? '' : 's'}`}
        description='Adjust how many items to fetch per source. Sources are synced sequentially.'
        startLabel='Start'
        onStart={() => {
          setSetupOpen(false);
          void syncAll();
        }}
      />

      <Dialog.Root
        open={state !== null}
        onOpenChange={open => {
          if (!open && state?.status === 'done') setState(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className='fixed inset-0 bg-black/30' />
          <Dialog.Popup className='fixed top-1/2 left-1/2 flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-white shadow-xl outline-none'>
            {state && <DialogBody state={state} onClose={() => setState(null)} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function DialogBody({ state, onClose }: { state: State; onClose: () => void }) {
  const running = state.status === 'running';
  const succeeded = state.results.filter(r => r.ok).length;
  const failed = state.results.length - succeeded;

  return (
    <>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <Dialog.Title className='text-base font-semibold'>
          {running ? 'Syncing all sources' : 'Sync complete'}
        </Dialog.Title>
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
              {state.current} of {state.total}
              {state.currentSource && (
                <>
                  {' · '}
                  <SourceLabel source={state.currentSource} />
                </>
              )}
            </div>
            <div className='h-1.5 w-full overflow-hidden rounded-full bg-gray-100'>
              <div
                className='h-full bg-sky-500 transition-all'
                style={{ width: `${(state.current / Math.max(state.total, 1)) * 100}%` }}
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
        {state.results.length === 0 ? (
          <div className='py-4 text-center text-sm text-gray-500'>Starting…</div>
        ) : (
          <ul className='flex flex-col'>
            {state.results.map(r => (
              <li key={r.source.id} className='flex items-start gap-2 border-b py-2 text-sm last:border-b-0'>
                <SourceLabel source={r.source} />
                <div className='ml-auto text-right text-xs'>
                  {r.ok ? (
                    <span className='inline-flex items-center gap-1 text-emerald-700'>
                      <Check className='size-3.5' />
                      {r.synced} synced
                    </span>
                  ) : (
                    <span className='text-rose-700' title={r.error}>
                      Failed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
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
