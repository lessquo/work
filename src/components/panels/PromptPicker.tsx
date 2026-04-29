import { type Prompt, type PromptId } from '@/lib/api';
import { cn } from '@/lib/cn';

export function PromptPicker({
  prompts,
  promptId,
  setPromptId,
}: {
  prompts: Prompt[];
  promptId: PromptId;
  setPromptId: (p: PromptId) => void;
}) {
  return (
    <section className='border-b px-4 py-3'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {prompts.map(p => {
          const active = promptId === p.id;
          return (
            <button
              key={p.id}
              type='button'
              onClick={() => setPromptId(p.id)}
              title={p.hint || undefined}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium',
                active ? 'selected-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
