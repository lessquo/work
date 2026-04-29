import { api } from '@/lib/api';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';

export function SourceIndexPage() {
  const { data: sources } = useSuspenseQuery({ queryKey: ['sources'], queryFn: api.listSources });
  if (sources.length === 0) return <Navigate to='/sources/add' replace />;
  return <Navigate to={`/sources/${sources[0].id}`} replace />;
}
