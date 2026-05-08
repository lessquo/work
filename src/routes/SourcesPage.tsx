import { PageHeader } from '@/components/PageHeader';
import { AddSourceDialog } from '@/components/sources/AddSourceDialog';
import { TYPE_LOGO } from '@/components/typeLogo';
import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, type Source } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

export function SourcesPage() {
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <title>Work Sources</title>

      <div className='min-w-0 flex-1 overflow-y-scroll px-4 py-6'>
        <div className='sticky top-0 z-10 mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <PageHeader />
          </div>
          <div className='stuck-on-scroll rounded-full'>
            <Tooltip content='Add source'>
              <button
                type='button'
                onClick={() => setAddOpen(true)}
                className='btn-md btn-ghost rounded-full'
                aria-label='Add source'
              >
                <Plus />
              </button>
            </Tooltip>
          </div>
        </div>

        <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} />

        {sources.length === 0 ? (
          <div className='rounded-lg border bg-white p-8 text-center text-sm text-gray-500'>No sources yet.</div>
        ) : (
          <ul className='flex flex-col rounded-lg border bg-white'>
            {sources.map(s => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function SourceRow({ source }: { source: Source }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const logo = TYPE_LOGO[source.type];
  const isLocal = source.type === 'plan';

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSource(source.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });

  const deleteButton = (
    <button
      type='button'
      onClick={async () => {
        if (isLocal) return;
        const ok = await confirm({
          title: `Delete source "${source.ext_id}"?`,
          description: 'All items, sessions, and resources for this source will be deleted.',
          confirmText: 'Delete source',
          destructive: true,
        });
        if (!ok) return;
        deleteMutation.mutate();
      }}
      disabled={isLocal || deleteMutation.isPending}
      aria-label={`Delete ${source.ext_id}`}
      className='btn-md btn-ghost mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100'
    >
      <Trash2 />
    </button>
  );

  return (
    <li className='group flex items-center border-b last:border-b-0 hover:bg-gray-50'>
      <Link to={`/items?source=${source.id}`} className='flex min-w-0 flex-1 items-center gap-3 px-4 py-3'>
        <img src={logo.src} alt={logo.alt} className='size-5 shrink-0' />
        <span className='min-w-0 flex-1 truncate font-medium'>{source.ext_id}</span>
        <span className='text-xs text-gray-500'>Added {timeAgo(source.created_at)}</span>
      </Link>
      {isLocal ? (
        <Tooltip content={`The local ${source.type} source is built in and cannot be deleted.`}>{deleteButton}</Tooltip>
      ) : (
        deleteButton
      )}
    </li>
  );
}
