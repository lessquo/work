import { useConfirm } from '@/components/ui/ConfirmDialog.lib';
import { Input } from '@/components/ui/Input';
import { api, type SecretKey, type Settings } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useSuspenseQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: secrets } = useSuspenseQuery({ queryKey: ['secrets'], queryFn: api.getSecrets });

  const [maxParallel, setMaxParallel] = useState<number>(settings.max_parallel);

  const saveParallelMutation = useMutation({
    mutationFn: (n: number) => api.updateSettings({ max_parallel: n }),
    onSuccess: s => {
      qc.setQueryData(['settings'], s);
      setMaxParallel(s.max_parallel);
    },
  });

  return (
    <>
      <title>Settings · Work</title>

      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-4xl p-6'>
          <h1 className='mb-4 text-lg font-semibold'>Settings</h1>
          <SetupSection
            title='Sentry'
            guidance={
              <>
                <p>
                  A <b>User Auth Token</b> scoped to your own Sentry account — simplest option for a local tool.
                </p>
                <Steps>
                  <li>
                    Go to{' '}
                    <ExtLink href='https://sentry.io/settings/account/api/auth-tokens/'>
                      sentry.io/settings/account/api/auth-tokens/
                    </ExtLink>
                    .
                  </li>
                  <li>
                    Click <b>Create New Token</b>.
                  </li>
                  <li>Name it however you like.</li>
                  <li>
                    Select these scopes:
                    <ul className='mt-1 ml-6 list-disc text-gray-600'>
                      <li>
                        <code className={codeCls}>org:read</code> — list orgs
                      </li>
                      <li>
                        <code className={codeCls}>project:read</code> — list projects, fetch project details
                      </li>
                      <li>
                        <code className={codeCls}>event:read</code> — fetch issues, events, stacktraces
                      </li>
                      <li>
                        <code className={codeCls}>event:admin</code> — required to mark issues resolved
                      </li>
                      <li>
                        <code className={codeCls}>member:read</code> — fetch current user, so resolves auto-assign to
                        you
                      </li>
                    </ul>
                  </li>
                  <li>
                    Copy the token (starts with <code className={codeCls}>sntrys_…</code>) — Sentry only shows it once.
                  </li>
                </Steps>
                <p className='mt-3 text-xs text-gray-500'>
                  When you resolve an issue, the token's owner is auto-assigned, and if the issue has a linked GitHub
                  PR, that URL is posted as a comment on the Sentry issue.
                </p>
              </>
            }
            form={
              <>
                <IdentifierField
                  settingKey='sentry_org'
                  label='Organization slug'
                  placeholder='your-org'
                  hint='From sentry.io/<slug>/. Used to list projects and resolve issues.'
                  current={settings.sentry_org}
                />
                <SecretField
                  secretKey='SENTRY_TOKEN'
                  label='Auth token'
                  hint='User Auth Token starting with sntrys_…'
                  configured={secrets.SENTRY_TOKEN.configured}
                />
              </>
            }
          />

          <SetupSection
            title='Jira'
            guidance={
              <>
                <p>
                  Needed if you want to attach Jira tickets to issue rows. A classic token uses your normal Jira
                  permissions — no scope selection needed.
                </p>
                <Steps>
                  <li>
                    Go to{' '}
                    <ExtLink href='https://id.atlassian.com/manage-profile/security/api-tokens'>
                      id.atlassian.com/manage-profile/security/api-tokens
                    </ExtLink>
                    .
                  </li>
                  <li>
                    Click <b>Create API token</b> (pick the classic/legacy option — simplest).
                  </li>
                  <li>
                    Name it however you like. Click <b>Create</b>.
                  </li>
                  <li>Copy the token — shown only once.</li>
                </Steps>
                <p className='mt-3 text-xs text-gray-500'>Only links on the configured host can be attached.</p>
              </>
            }
            form={
              <>
                <IdentifierField
                  settingKey='jira_org'
                  label='Organization'
                  placeholder='your-org'
                  hint='Atlassian site slug — the URL is built as https://<org>.atlassian.net.'
                  current={settings.jira_org}
                />
                <IdentifierField
                  settingKey='jira_email'
                  label='Email'
                  placeholder='you@example.com'
                  hint='Atlassian account email — paired with the API token for Basic auth.'
                  current={settings.jira_email}
                />
                <SecretField
                  secretKey='JIRA_API_TOKEN'
                  label='API token'
                  hint='Token from id.atlassian.com/manage-profile/security/api-tokens.'
                  configured={secrets.JIRA_API_TOKEN.configured}
                />
              </>
            }
          />

          <SetupSection
            title='GitHub'
            guidance={
              <>
                <p>
                  Needed for attaching PRs to issue rows. There's no GitHub secret in the app — it shells out to{' '}
                  <code className={codeCls}>gh</code>, which reads its own auth.
                </p>
                <Steps>
                  <li>
                    Install from <ExtLink href='https://cli.github.com/'>cli.github.com</ExtLink> (or{' '}
                    <code className={codeCls}>brew install gh</code> on macOS).
                  </li>
                  <li>
                    Authenticate: <code className={codeCls}>gh auth login</code>.
                  </li>
                </Steps>
              </>
            }
            form={
              <IdentifierField
                settingKey='github_org'
                label='Organization'
                placeholder='your-org'
                hint='Used by `gh repo list <org>` to populate the repo dropdown.'
                current={settings.github_org}
              />
            }
          />

          <SetupSection
            title='Claude Agent SDK'
            guidance={
              <>
                <p>
                  Needed for the <b>Try Claude</b> button on issue rows. The worker calls the{' '}
                  <code className={codeCls}>@anthropic-ai/claude-agent-sdk</code>{' '}
                  <code className={codeCls}>query()</code> API in-process — no <code className={codeCls}>claude</code>{' '}
                  CLI is spawned. The SDK reads the same credentials as the Claude CLI, so you authenticate once with
                  the CLI and the SDK picks it up.
                </p>
                <Steps>
                  <li>
                    Install the CLI from{' '}
                    <ExtLink href='https://docs.claude.com/en/docs/claude-code/overview'>
                      docs.claude.com/en/docs/claude-code
                    </ExtLink>{' '}
                    (or <code className={codeCls}>npm install -g @anthropic-ai/claude-code</code>).
                  </li>
                  <li>
                    Authenticate the first time: run <code className={codeCls}>claude</code> once in any folder and
                    complete the login.
                  </li>
                </Steps>
                <p className='mt-3 text-xs text-gray-500'>
                  The worker runs Claude with <code className={codeCls}>permissionMode: 'bypassPermissions'</code> and{' '}
                  <code className={codeCls}>allowDangerouslySkipPermissions: true</code> — inside the per-session clone
                  Claude can read, edit, and run anything (shell commands included) without prompting. The blast radius
                  is the throwaway clone in <code className={codeCls}>clones/session-&lt;id&gt;/</code>; you still
                  review every change via the <b>Diff</b> tab and create the PR yourself.
                </p>
                <p className='mt-3 text-xs text-gray-500'>
                  MCP connectors you've authorized at{' '}
                  <ExtLink href='https://claude.ai/settings/connectors'>claude.ai/settings/connectors</ExtLink> (Jira,
                  Sentry, etc.) ride along with your account auth and are available to the spawned agent automatically —
                  the Jira and Sentry prompts use them to fetch issue context. The only MCP server configured locally is{' '}
                  <code className={codeCls}>context7</code> for library docs.
                </p>
              </>
            }
          />

          <section className='mb-8 rounded-md border bg-white p-4'>
            <div className='mb-1 flex items-center gap-2'>
              <h2 className='text-sm font-semibold'>Parallelism</h2>
              <span className='rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gray-600 uppercase'>
                Global
              </span>
            </div>
            <p className='mb-3 text-xs text-gray-500'>
              Maximum number of Claude sessions executing in parallel across all sources. Changes apply to queued work
              immediately; running jobs keep going.
            </p>
            <div className='flex items-center gap-3'>
              <Input
                variant='unstyled'
                type='range'
                min={1}
                max={8}
                step={1}
                value={maxParallel}
                onChange={e => setMaxParallel(Number(e.target.value))}
                onMouseUp={() => saveParallelMutation.mutate(maxParallel)}
                onTouchEnd={() => saveParallelMutation.mutate(maxParallel)}
                onKeyUp={() => saveParallelMutation.mutate(maxParallel)}
                className='flex-1 accent-emerald-600'
              />
              <span className='w-16 text-right font-mono text-sm text-gray-700'>
                {maxParallel} {saveParallelMutation.isPending && <span className='text-xs text-gray-400'>…</span>}
              </span>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

type IdentifierKey = 'sentry_org' | 'github_org' | 'jira_org' | 'jira_email';

function IdentifierField({
  settingKey,
  label,
  placeholder,
  hint,
  current,
}: {
  settingKey: IdentifierKey;
  label: string;
  placeholder: string;
  hint: string;
  current: string;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(current);

  const saveMutation = useMutation({
    mutationFn: () => api.updateSettings({ [settingKey]: value } as Partial<Settings>),
    onSuccess: s => {
      qc.setQueryData(['settings'], s);
      setValue(s[settingKey]);
    },
  });

  const dirty = value !== current;
  const error = saveMutation.error instanceof Error ? saveMutation.error.message : null;

  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-sm font-medium text-gray-700'>{label}</span>
      <p className='text-xs text-gray-400'>{hint}</p>
      <div className='flex items-center gap-2'>
        <Input
          type='text'
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className='flex-1 font-mono placeholder:font-sans'
          autoComplete='off'
          spellCheck={false}
        />
        <button
          type='button'
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className='btn-md btn-neutral'
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && (
        <div className='rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>{error}</div>
      )}
    </div>
  );
}

function SecretField({
  secretKey,
  label,
  hint,
  configured,
}: {
  secretKey: SecretKey;
  label: string;
  hint: string;
  configured: boolean;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [value, setValue] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => api.setSecret(secretKey, value),
    onSuccess: () => {
      setValue('');
      qc.invalidateQueries({ queryKey: ['secrets'] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearSecret(secretKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['secrets'] });
    },
  });

  const error =
    (saveMutation.error instanceof Error ? saveMutation.error.message : null) ??
    (clearMutation.error instanceof Error ? clearMutation.error.message : null);

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium text-gray-700'>{label}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
            configured
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-gray-200 bg-gray-50 text-gray-500',
          )}
        >
          {configured ? 'Configured' : 'Not set'}
        </span>
      </div>
      <p className='text-xs text-gray-400'>{hint}</p>
      <div className='flex items-center gap-2'>
        <Input
          type='password'
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={configured ? 'Enter new value to replace' : 'Paste secret value'}
          className='flex-1 font-mono placeholder:font-sans'
          autoComplete='off'
        />
        <button
          type='button'
          onClick={() => saveMutation.mutate()}
          disabled={value.trim().length === 0 || saveMutation.isPending}
          className='btn-md btn-neutral'
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {configured && (
          <button
            type='button'
            onClick={async () => {
              const ok = await confirm({
                title: `Clear ${label}?`,
                description: `${label} will be removed from this app. Syncing will fail until you set it again.`,
                confirmText: 'Clear',
                destructive: true,
              });
              if (!ok) return;
              clearMutation.mutate();
            }}
            disabled={clearMutation.isPending}
            className='btn-md btn-danger'
          >
            {clearMutation.isPending ? 'Clearing…' : 'Clear'}
          </button>
        )}
      </div>
      {error && (
        <div className='rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>{error}</div>
      )}
    </div>
  );
}

function SetupSection({ title, guidance, form }: { title: string; guidance: React.ReactNode; form?: React.ReactNode }) {
  return (
    <section className='mb-8 rounded-lg border bg-white p-5'>
      <h2 className='mb-3 text-base font-semibold'>{title}</h2>
      {form ? (
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div className='space-y-3 text-sm text-gray-700'>{guidance}</div>
          <div className='flex flex-col gap-4'>{form}</div>
        </div>
      ) : (
        <div className='space-y-3 text-sm text-gray-700'>{guidance}</div>
      )}
    </section>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className='ml-5 list-decimal space-y-1.5 text-gray-700'>{children}</ol>;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className='text-sky-700 underline underline-offset-2 hover:text-sky-800'
    >
      {children}
    </a>
  );
}

const codeCls = 'rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800';
