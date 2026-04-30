import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

/** Clone `owner/repo` into `dest` (which must not already exist) and return the default branch. */
export async function prepareClone(dest: string, githubRepo: string): Promise<{ defaultBranch: string }> {
  mkdirSync(dirname(dest), { recursive: true });
  await execFileP(
    'git',
    ['clone', '--depth', '1', '--single-branch', '--no-tags', `https://github.com/${githubRepo}.git`, dest],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const defaultBranch = await detectDefaultBranch(dest);
  ensureLocalExcludes(dest, ['COMMIT_MSG.txt', 'PR_BODY.md']);
  return { defaultBranch };
}

/** Add patterns to .git/info/exclude (local-only, never committed). Idempotent. */
function ensureLocalExcludes(repo: string, patterns: string[]): void {
  const path = resolve(repo, '.git', 'info', 'exclude');
  let current = '';
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    /* file may not exist */
  }
  const lines = new Set(current.split(/\r?\n/));
  let changed = false;
  for (const p of patterns) {
    if (!lines.has(p)) {
      lines.add(p);
      changed = true;
    }
  }
  if (!changed) return;
  const body =
    Array.from(lines)
      .filter(l => l.length > 0)
      .join('\n') + '\n';
  writeFileSync(path, body, 'utf8');
}

async function detectDefaultBranch(repo: string): Promise<string> {
  try {
    const ref = await git(repo, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    for (const candidate of ['main', 'master']) {
      try {
        await git(repo, ['rev-parse', '--verify', `origin/${candidate}`]);
        return candidate;
      } catch {
        /* try next */
      }
    }
    throw new Error('Could not detect default branch');
  }
}

export async function checkoutNewBranch(repo: string, branch: string, from: string): Promise<void> {
  await git(repo, ['checkout', '-b', branch, from]);
}

export async function commitAll(repo: string, message: string): Promise<boolean> {
  await git(repo, ['add', '-A']);
  const staged = await git(repo, ['diff', '--cached', '--name-only']);
  if (!staged) return false;
  await execFileP('git', ['commit', '-m', message, '--no-verify'], { cwd: repo });
  return true;
}

/** Combined diff of committed + uncommitted work against `base`. */
export async function diffAgainst(repo: string, base: string): Promise<string> {
  return git(repo, ['diff', base]);
}

export async function hasChanges(repo: string): Promise<boolean> {
  const out = await git(repo, ['status', '--porcelain']);
  return out.length > 0;
}

/**
 * Mark all untracked files as "intent to add" so they appear in `git diff` as new file additions.
 * Respects .gitignore + .git/info/exclude (so our meta files are skipped).
 */
export async function intentToAddAll(repo: string): Promise<void> {
  await git(repo, ['add', '--intent-to-add', '-A']);
}

export async function pushBranch(repo: string, branch: string): Promise<void> {
  await execFileP('git', ['push', '-u', 'origin', branch], { cwd: repo, maxBuffer: 10 * 1024 * 1024 });
}

export async function createPrViaGh(repo: string, branch: string, title: string, body: string): Promise<string> {
  const { stdout } = await execFileP(
    'gh',
    ['pr', 'create', '--head', branch, '--assignee', '@me', '--title', title, '--body', body],
    { cwd: repo, maxBuffer: 10 * 1024 * 1024 },
  );
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
  if (!match) throw new Error(`Could not parse PR URL from gh output: ${stdout.slice(0, 300)}`);
  return match[0];
}

export async function editPrViaGh(repo: string, prUrl: string, title: string, body: string): Promise<void> {
  await execFileP('gh', ['pr', 'edit', prUrl, '--title', title, '--body', body], {
    cwd: repo,
    maxBuffer: 10 * 1024 * 1024,
  });
}
