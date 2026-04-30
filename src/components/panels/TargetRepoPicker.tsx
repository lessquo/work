import { Select, type SelectOption } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export function TargetRepoPicker({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const sourcesQuery = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const repos = (sourcesQuery.data ?? []).filter(s => s.type === 'github_pr').map(s => s.external_id);

  // Fire the auto-default at most once per mount. Without this guard, callers that pass an
  // inline onChange (e.g. one that wraps a mutation) recreate the function each render, the
  // dep array shifts, the effect re-fires, and a new mutation is queued before the previous
  // one resolves — eventually tripping React's "max update depth" limit.
  const autoDefaultedRef = useRef(false);
  useEffect(() => {
    if (allowEmpty || autoDefaultedRef.current) return;
    if (!value && repos.length > 0) {
      autoDefaultedRef.current = true;
      onChange(repos[0]);
    }
  }, [allowEmpty, value, repos, onChange]);

  const options: SelectOption<string>[] = [
    ...(allowEmpty ? [{ value: '', label: '— none (text only) —' }] : []),
    ...(!allowEmpty && repos.length === 0 ? [{ value: '', label: '— select —' }] : []),
    ...repos.map(repo => ({ value: repo, label: repo })),
  ];

  return (
    <label className='flex items-center gap-2 text-xs text-gray-600'>
      <span className='shrink-0'>Target repo:</span>
      <Select<string>
        ariaLabel='Target repo'
        value={value}
        onChange={onChange}
        options={options}
        className='min-w-0 flex-1 text-xs'
      />
      {repos.length === 0 && !sourcesQuery.isLoading && (
        <span className='text-[11px] text-gray-400'>(no GitHub sources)</span>
      )}
    </label>
  );
}
