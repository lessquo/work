import { upsertItems, type Source } from '@server/db.js';
import { getGithubOrg } from '@server/settings.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const REPO_LIST_LIMIT = 200;

export function canonicalGithubPrUrl(owner: string, repo: string, number: number): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

async function runGh(args: string[], label: string): Promise<string> {
  try {
    const { stdout } = await execFileP('gh', args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string; code?: string };
    const hint =
      err.code === 'ENOENT'
        ? 'gh CLI not found — install from https://cli.github.com and run `gh auth login`'
        : (err.stderr || err.message || String(e)).trim();
    throw new Error(`${label} failed: ${hint.slice(0, 300)}`, { cause: e });
  }
}

function parseOwnerRepo(extId: string): { owner: string; repo: string } {
  const m = extId.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) {
    throw new Error(`GitHub source ext_id must be "owner/repo" — got "${extId}".`);
  }
  return { owner: m[1], repo: m[2] };
}

type GithubPrListEntry = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  headRefName: string;
  author: { login?: string } | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
};

export type GithubRepo = { nameWithOwner: string; name: string; description: string | null };

type GithubRepoListEntry = {
  name: string;
  nameWithOwner: string;
  description: string | null;
  isArchived: boolean;
};

export async function fetchGithubRepos(): Promise<GithubRepo[]> {
  const org = getGithubOrg();
  if (!org) throw new Error('GitHub org is not set. Configure it in Settings → GitHub.');
  const stdout = await runGh(
    ['repo', 'list', org, '--limit', String(REPO_LIST_LIMIT), '--json', 'name,nameWithOwner,description,isArchived'],
    'gh repo list',
  );
  const repos = JSON.parse(stdout) as GithubRepoListEntry[];
  return repos
    .filter(r => !r.isArchived)
    .map(r => ({ nameWithOwner: r.nameWithOwner, name: r.name, description: r.description }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const PR_JSON_FIELDS = 'id,number,title,url,state,isDraft,headRefName,author,createdAt,updatedAt,mergedAt';

async function fetchPrs(owner: string, repo: string, limit: number): Promise<GithubPrListEntry[]> {
  const stdout = await runGh(
    ['pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'all', '--limit', String(limit), '--json', PR_JSON_FIELDS],
    'gh pr list',
  );
  return JSON.parse(stdout) as GithubPrListEntry[];
}

export async function fetchGithubPr(owner: string, repo: string, number: number): Promise<GithubPrListEntry> {
  const stdout = await runGh(
    ['pr', 'view', String(number), '--repo', `${owner}/${repo}`, '--json', PR_JSON_FIELDS],
    'gh pr view',
  );
  return JSON.parse(stdout) as GithubPrListEntry;
}

export async function upsertGithubPr(
  sourceId: number,
  owner: string,
  repo: string,
  number: number,
): Promise<GithubPrListEntry> {
  const pr = await fetchGithubPr(owner, repo, number);
  upsertItems('github_pr', sourceId, [
    {
      ext_id: pr.id,
      key: String(number),
      url: pr.url || canonicalGithubPrUrl(owner, repo, number),
      raw: JSON.stringify(pr),
    },
  ]);
  return pr;
}

export function parseGithubPrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export async function syncGithubSource(source: Source, limit: number): Promise<number> {
  const { owner, repo } = parseOwnerRepo(source.ext_id);

  const remote = await fetchPrs(owner, repo, limit);
  upsertItems(
    'github_pr',
    source.id,
    remote.map(pr => ({
      ext_id: pr.id,
      key: String(pr.number),
      url: pr.url || canonicalGithubPrUrl(owner, repo, pr.number),
      raw: JSON.stringify(pr),
    })),
  );
  return remote.length;
}
