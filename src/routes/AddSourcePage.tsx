import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api, type ItemType } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

type SourceFormValues = {
  type: ItemType;
  ext_id: string;
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
    handleSubmit,
    setError,
    watch,
    control,
    formState: { isSubmitting, isDirty, errors },
  } = useForm<SourceFormValues>({ defaultValues: { type: 'sentry_issue', ext_id: '' } });

  const type = watch('type');
  const extId = watch('ext_id');
  const option = TYPE_OPTIONS.find(o => o.value === type) ?? TYPE_OPTIONS[0];
  const canSubmit = extId.trim().length > 0 && isDirty && !isSubmitting;

  const submit = handleSubmit(async values => {
    const trimmed: SourceFormValues = {
      type: values.type,
      ext_id: values.ext_id.trim(),
    };
    try {
      const s = await api.createSource(trimmed);
      qc.invalidateQueries({ queryKey: ['sources'] });
      navigate(`/items?source=${s.id}`);
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : String(e) });
    }
  });

  return (
    <>
      <title>Add source · Work</title>

      <div className='mx-auto max-w-xl p-6'>
        <h1 className='mb-1 text-lg font-semibold'>Add source</h1>
        <p className='mb-5 text-sm text-gray-500'>Pick a type and choose from your existing projects/repos.</p>
        <form onSubmit={submit} className='flex flex-col gap-5 rounded-lg border bg-white p-5'>
          <Field label='Type' required>
            <Controller
              name='type'
              control={control}
              render={({ field }) => (
                <Select<ItemType>
                  value={field.value}
                  onChange={field.onChange}
                  options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  ariaLabel='Source type'
                  className={selectCls}
                />
              )}
            />
          </Field>

          <Field label={option.label} hint={option.hint} required>
            <Controller
              name='ext_id'
              control={control}
              rules={{ validate: v => v.trim().length > 0 }}
              render={({ field }) =>
                type === 'sentry_issue' ? (
                  <SentryProjectField value={field.value} onChange={field.onChange} />
                ) : type === 'github_pr' ? (
                  <GithubRepoField value={field.value} onChange={field.onChange} />
                ) : (
                  <JiraProjectField value={field.value} onChange={field.onChange} />
                )
              }
            />
          </Field>

          {errors.root && (
            <div className='rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700'>
              {errors.root.message}
            </div>
          )}

          <div className='flex items-center justify-end gap-2 pt-1'>
            <button type='submit' disabled={!canSubmit} className='btn-md btn-neutral'>
              {isSubmitting ? 'Creating…' : 'Create source'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

type FieldProps = { value: string; onChange: (v: string) => void };

function SentryProjectField({ value, onChange }: FieldProps) {
  const projectsQuery = useQuery({ queryKey: ['sentry-projects'], queryFn: api.listSentryProjects });

  if (projectsQuery.isPending) {
    return <Input value={value} disabled placeholder='Loading projects…' readOnly />;
  }

  if (projectsQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder='webapp' autoFocus />
        <div className='text-sm text-amber-700'>
          Couldn't load Sentry projects ({projectsQuery.error instanceof Error ? projectsQuery.error.message : 'error'}
          ). Make sure the Sentry org slug and token are set in Settings → Sentry, then enter the slug manually.
        </div>
      </div>
    );
  }

  const projects = projectsQuery.data;
  const knowsCurrent = value === '' || projects.some(p => p.slug === value);

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        value={value}
        onChange={onChange}
        ariaLabel='Sentry project'
        className={selectCls}
        options={[
          { value: '', label: '— Select a project —' },
          ...(!knowsCurrent ? [{ value, label: `${value} (not in your Sentry projects)` }] : []),
          ...projects.map(p => ({ value: p.slug, label: `${p.name} (${p.slug})` })),
        ]}
      />
      {projects.length === 0 && <div className='text-sm text-gray-500'>No projects found in your Sentry org.</div>}
    </div>
  );
}

function JiraProjectField({ value, onChange }: FieldProps) {
  const projectsQuery = useQuery({ queryKey: ['jira-projects'], queryFn: api.listJiraProjects });

  if (projectsQuery.isPending) {
    return <Input value={value} disabled placeholder='Loading projects…' readOnly />;
  }

  if (projectsQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder='PROJ' autoFocus />
        <div className='text-sm text-amber-700'>
          Couldn't load Jira projects ({projectsQuery.error instanceof Error ? projectsQuery.error.message : 'error'}).
          Make sure the Jira organization, email, and API token are set in Settings → Jira, then enter the project key
          manually.
        </div>
      </div>
    );
  }

  const projects = projectsQuery.data;
  const knowsCurrent = value === '' || projects.some(p => p.key === value);

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        value={value}
        onChange={onChange}
        ariaLabel='Jira project'
        className={selectCls}
        options={[
          { value: '', label: '— Select a project —' },
          ...(!knowsCurrent ? [{ value, label: `${value} (not in your Jira site)` }] : []),
          ...projects.map(p => ({ value: p.key, label: `${p.name} (${p.key})` })),
        ]}
      />
      {projects.length === 0 && <div className='text-sm text-gray-500'>No projects found in your Jira site.</div>}
    </div>
  );
}

function GithubRepoField({ value, onChange }: FieldProps) {
  const reposQuery = useQuery({ queryKey: ['github-repos'], queryFn: api.listGithubRepos });

  if (reposQuery.isPending) {
    return <Input value={value} disabled placeholder='Loading repos…' readOnly />;
  }

  if (reposQuery.isError) {
    return (
      <div className='flex flex-col gap-1.5'>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder='owner/repo' autoFocus />
        <div className='text-sm text-amber-700'>
          Couldn't load GitHub repos ({reposQuery.error instanceof Error ? reposQuery.error.message : 'error'}). Make
          sure <code className='rounded bg-gray-100 px-1 py-0.5 font-mono'>gh auth login</code> is set up, then enter{' '}
          <code className='rounded bg-gray-100 px-1 py-0.5 font-mono'>owner/repo</code> manually.
        </div>
      </div>
    );
  }

  const repos = reposQuery.data;
  const knowsCurrent = value === '' || repos.some(r => r.nameWithOwner === value);

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        value={value}
        onChange={onChange}
        ariaLabel='GitHub repo'
        className={selectCls}
        options={[
          { value: '', label: '— Select a repo —' },
          ...(!knowsCurrent ? [{ value, label: `${value} (not in your GitHub org)` }] : []),
          ...repos.map(r => ({ value: r.nameWithOwner, label: r.nameWithOwner })),
        ]}
      />
      {repos.length === 0 && <div className='text-sm text-gray-500'>No repos found in your GitHub org.</div>}
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
    <div className='flex flex-col gap-1'>
      <span className='text-sm font-medium text-gray-700'>
        {label}
        {required && <span className='text-rose-500'> *</span>}
        {hint && <span className='ml-2 font-normal text-gray-400'>{hint}</span>}
      </span>
      {children}
    </div>
  );
}

const selectCls = 'w-full justify-between border-gray-300 px-3 py-2 text-sm font-normal';
