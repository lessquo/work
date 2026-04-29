import { SourceForm } from '@/components/SourceForm';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

export function AddSourcePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <div className='mx-auto max-w-xl p-6'>
      <h1 className='mb-1 text-lg font-semibold'>Add source</h1>
      <p className='mb-5 text-sm text-gray-500'>
        Pick a type and choose from your existing projects/repos.
      </p>
      <SourceForm
        submitLabel='Create source'
        submittingLabel='Creating…'
        onSubmit={async values => {
          const s = await api.createSource(values);
          qc.invalidateQueries({ queryKey: ['sources'] });
          navigate(`/sources/${s.id}`);
        }}
      />
    </div>
  );
}
