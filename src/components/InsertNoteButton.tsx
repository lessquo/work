import { api, type NotebookDetail } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Menu } from '@base-ui/react/menu';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight, NotebookPen } from 'lucide-react';

export function InsertNoteButton({ onInsert }: { onInsert: (note: { title: string; body_md: string }) => void }) {
  const notebooksQuery = useQuery({
    queryKey: ['notebooks'],
    queryFn: api.listNotebooks,
  });
  const notebooks = notebooksQuery.data ?? [];

  const detailQueries = useQueries({
    queries: notebooks.map(nb => ({
      queryKey: ['notebook', nb.id],
      queryFn: () => api.getNotebook(nb.id),
      enabled: notebooks.length > 0,
    })),
  });

  const detailsById = new Map<number, NotebookDetail>();
  detailQueries.forEach(q => {
    if (q.data) detailsById.set(q.data.id, q.data);
  });

  return (
    <Menu.Root>
      <Menu.Trigger className={cn('btn-sm btn-secondary', 'data-popup-open:bg-gray-100')}>
        <NotebookPen />
        Insert note
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4}>
          <Menu.Popup className='popup max-h-80 overflow-y-auto'>
            {notebooks.length === 0 ? (
              <div className='px-3 py-1.5 text-xs text-gray-500'>No notebooks yet.</div>
            ) : (
              notebooks.map(nb => {
                const detail = detailsById.get(nb.id);
                const notes = detail?.notes ?? [];
                return (
                  <Menu.Group key={nb.id}>
                    <Menu.GroupLabel className='menu-group-label'>{detail?.title ?? 'Notebook'}</Menu.GroupLabel>
                    {notes.length === 0 ? (
                      <div className='px-3 py-1 text-xs text-gray-400'>(empty)</div>
                    ) : (
                      notes.map(note => (
                        <Menu.Item
                          key={note.id}
                          onClick={() => onInsert({ title: note.title, body_md: note.body_md })}
                          className='menu-item justify-between'
                        >
                          <span className='truncate'>{note.title}</span>
                          <ChevronRight className='text-gray-400' />
                        </Menu.Item>
                      ))
                    )}
                    <Menu.Separator className='menu-separator' />
                  </Menu.Group>
                );
              })
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
