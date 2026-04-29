import { api, type ItemType } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { useNavigate } from 'react-router';

type SourceFormValues = {
  type: ItemType;
  external_id: string;
};

const TYPE_OPTIONS: Array<{ value: ItemType; label: string; hint: string }> = [
  { value: 'sentry_issue', label: 'Sentry project', hint: 'Sentry project slug' },
  { value: 'github_pr', label: 'GitHub repo', hint: 'owner/repo' },
  { value: 'jira_issue', label: 'Jira project', hint: 'Jira project key' },
];

export function AddSourcePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { isSubmitting, isDirty, errors },
  } = useForm<SourceFormValues>({ defaultValues: { type: 'sentry_issue', external_id: '' } });

  const type = watch('type');
  const externalId = watch('external_id');
  const option = TYPE_OPTIONS.find(o => o.value === type) ?? TYPE_OPTIONS[0];
  const canSubmit = externalId.trim().length > 0 && isDirty && !isSubmitting;

  const submit = handleSubmit(async values => {
    const trimmed: SourceFormValues = {
      type: values.type,
      external_id: values.external_id.trim(),
    };
    try {
      const s = await api.createSource(trimmed);
      qc.invalidateQueries({ queryKey: ['sources'] });
      navigate(`/sources/${s.id}`);
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : String(e) });
    }
  });

  return (
    <div className='mx-auto max-w-xl p-6'>
      <h1 className='mb-1 text-lg font-semibold'>Add source</h1>
      <p className='mb-5 text-sm text-gray-500'>Pick a type and choose from your existing projects/repos.</p>
      <form onSubmit={submit} className='flex flex-col gap-4'>
        <Field label='Type' required>
          <select {...register('type')} className={inputCls}>
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label='External ID' hint={option.hint} required>
          {type === 'sentry_issue' ? (
            <SentryProjectField
              register={register('external_id', { validate: v => v.trim().length > 0 })}
              currentValue={externalId}
            />
          ) : type === 'github_pr' ? (
            <GithubRepoField
              register={register('external_id', { validate: v => v.trim().length > 0 })}
              currentValue={externalId}
            />
          ) : (
            <JiraProjectField
              register={register('external_id', { validate: v => v.trim().length > 0 })}
              currentValue={externalId}
            />
          )}
        </Field>

        {errors.root && (
          <div className='rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>
            {errors.root.message}
          </div>
        )}

        <div className='mt-2 flex items-center justify-end gap-2'>
          <button type='submit' disabled={!canSubmit} className='btn-md btn-secondary'>
            {isSubmitting ? 'Creating…' : 'Create source'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SentryProjectField({ register, currentValue }: { register: UseFormRegisterReturn; currentValue: string }) {
  const projectsQuery = useQuery({ queryKey: ['sentry-projects'], queryFn: api.listSentryProjects });

  if (projectsQuery.isPending) {
    return <input {...register} disabled placeholder='Loading projects…' className={inputCls} />;
  }

  if (projectsQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <input {...register} placeholder='webapp' className={inputCls} autoFocus />
        <div className='text-xs text-amber-700'>
          Couldn't load Sentry projects ({projectsQuery.error instanceof Error ? projectsQuery.error.message : 'error'}
          ). Make sure the Sentry org slug and token are set in Settings → Sentry, then enter the slug manually.
        </div>
      </div>
    );
  }

  const projects = projectsQuery.data;
  const knowsCurrent = currentValue === '' || projects.some(p => p.slug === currentValue);

  return (
    <div className='flex flex-col gap-1.5'>
      <select {...register} className={inputCls} autoFocus>
        <option value=''>— Select a project —</option>
        {!knowsCurrent && <option value={currentValue}>{currentValue} (not in your Sentry projects)</option>}
        {projects.map(p => (
          <option key={p.slug} value={p.slug}>
            {p.name} ({p.slug})
          </option>
        ))}
      </select>
      {projects.length === 0 && <div className='text-xs text-gray-500'>No projects found in your Sentry org.</div>}
    </div>
  );
}

function JiraProjectField({ register, currentValue }: { register: UseFormRegisterReturn; currentValue: string }) {
  const projectsQuery = useQuery({ queryKey: ['jira-projects'], queryFn: api.listJiraProjects });

  if (projectsQuery.isPending) {
    return <input {...register} disabled placeholder='Loading projects…' className={inputCls} />;
  }

  if (projectsQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <input {...register} placeholder='PROJ' className={inputCls} autoFocus />
        <div className='text-xs text-amber-700'>
          Couldn't load Jira projects ({projectsQuery.error instanceof Error ? projectsQuery.error.message : 'error'}).
          Make sure the Jira organization, email, and API token are set in Settings → Jira, then enter the project key
          manually.
        </div>
      </div>
    );
  }

  const projects = projectsQuery.data;
  const knowsCurrent = currentValue === '' || projects.some(p => p.key === currentValue);

  return (
    <div className='flex flex-col gap-1.5'>
      <select {...register} className={inputCls} autoFocus>
        <option value=''>— Select a project —</option>
        {!knowsCurrent && <option value={currentValue}>{currentValue} (not in your Jira site)</option>}
        {projects.map(p => (
          <option key={p.key} value={p.key}>
            {p.name} ({p.key})
          </option>
        ))}
      </select>
      {projects.length === 0 && <div className='text-xs text-gray-500'>No projects found in your Jira site.</div>}
    </div>
  );
}

function GithubRepoField({ register, currentValue }: { register: UseFormRegisterReturn; currentValue: string }) {
  const reposQuery = useQuery({ queryKey: ['github-repos'], queryFn: api.listGithubRepos });

  if (reposQuery.isPending) {
    return <input {...register} disabled placeholder='Loading repos…' className={inputCls} />;
  }

  if (reposQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <input {...register} placeholder='owner/repo' className={inputCls} autoFocus />
        <div className='text-xs text-amber-700'>
          Couldn't load GitHub repos ({reposQuery.error instanceof Error ? reposQuery.error.message : 'error'}). Make
          sure <code className='rounded bg-gray-100 px-1 py-0.5 font-mono'>gh auth login</code> is set up, then enter{' '}
          <code className='rounded bg-gray-100 px-1 py-0.5 font-mono'>owner/repo</code> manually.
        </div>
      </div>
    );
  }

  const repos = reposQuery.data;
  const knowsCurrent = currentValue === '' || repos.some(r => r.nameWithOwner === currentValue);

  return (
    <div className='flex flex-col gap-1.5'>
      <select {...register} className={inputCls} autoFocus>
        <option value=''>— Select a repo —</option>
        {!knowsCurrent && <option value={currentValue}>{currentValue} (not in your GitHub org)</option>}
        {repos.map(r => (
          <option key={r.nameWithOwner} value={r.nameWithOwner}>
            {r.nameWithOwner}
          </option>
        ))}
      </select>
      {repos.length === 0 && <div className='text-xs text-gray-500'>No repos found in your GitHub org.</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-sm font-medium text-gray-700'>
        {label}
        {required && <span className='text-rose-500'> *</span>}
        {hint && <span className='ml-2 font-normal text-gray-400'>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
