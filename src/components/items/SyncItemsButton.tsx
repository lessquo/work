import {
  SyncProgressDialog,
  type SyncProgressItem,
  type SyncProgressState,
} from '@/components/items/SyncProgressDialog';
import { SyncSetupDialog } from '@/components/items/SyncSetupDialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useState } from 'react';

export function SyncItemsButton() {
  const qc = useQueryClient();
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const [state, setState] = useState<SyncProgressState | null>(null);
  const [setupOpen, setSetupOpen] = useQueryState('syncSetup', parseAsBoolean.withDefault(false));

  function patchItem(index: number, patch: Partial<SyncProgressItem>) {
    setState(prev =>
      prev ? { ...prev, items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) } : prev,
    );
  }

  async function syncSelected(selectedIds: number[]) {
    const targets = sources.filter(s => selectedIds.includes(s.id));
    if (targets.length === 0) return;
    setState({
      status: 'running',
      items: targets.map(s => ({ source: s, phase: 'pending' })),
    });
    for (let i = 0; i < targets.length; i++) {
      patchItem(i, { phase: 'running' });
      try {
        const { synced } = await api.syncSource(targets[i].id);
        patchItem(i, { phase: 'succeeded', synced });
      } catch (e) {
        patchItem(i, { phase: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setState(prev => (prev ? { ...prev, status: 'done' } : prev));
    qc.invalidateQueries({ queryKey: ['items'] });
  }

  return (
    <>
      <button
        type='button'
        onClick={() => setSetupOpen(true)}
        disabled={sources.length === 0 || state?.status === 'running'}
        className='btn-md btn-secondary'
      >
        <RefreshCw className={cn('size-3.5', state?.status === 'running' && 'animate-spin')} />
        Sync items
      </button>

      <SyncSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        sources={sources}
        onStart={ids => {
          setSetupOpen(false);
          void syncSelected(ids);
        }}
      />

      <SyncProgressDialog state={state} onClose={() => setState(null)} />
    </>
  );
}
