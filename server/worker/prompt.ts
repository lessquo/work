import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export type PromptContext = Record<string, string>;

export type PromptId = string;
export type PromptSourceType = 'sentry_issue' | 'jira_issue' | 'github_pr' | 'plan';
export type PromptMeta = { label: string; hint: string; applies_to: PromptSourceType | null };

const PROMPT_SOURCE_TYPES: PromptSourceType[] = ['sentry_issue', 'jira_issue', 'github_pr', 'plan'];

const ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const PROMPTS_DIR = resolve(process.cwd(), 'prompts');

export function promptPath(id: string): string {
  return resolve(PROMPTS_DIR, `${id}.md`);
}

// The oldest prompt by birthtime — matches the order used in the prompts list UI.
export async function firstPromptId(): Promise<PromptId> {
  const entries = (await readdir(PROMPTS_DIR)).filter(f => f.endsWith('.md'));
  if (entries.length === 0) throw new Error('no prompts available');
  const stamped = await Promise.all(
    entries.map(async f => ({ id: f.slice(0, -3), birth: (await stat(resolve(PROMPTS_DIR, f))).birthtimeMs })),
  );
  stamped.sort((a, b) => a.birth - b.birth);
  return stamped[0].id;
}

export function isPromptId(v: unknown): v is PromptId {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (!ID_REGEX.test(v)) return false;
  return existsSync(promptPath(v));
}

function isPromptSourceType(v: string): v is PromptSourceType {
  return (PROMPT_SOURCE_TYPES as string[]).includes(v);
}

/** Parse a prompt markdown file. Frontmatter (between `---` markers) is optional. */
export function parsePromptFile(text: string): { meta: PromptMeta; content: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: { label: '', hint: '', applies_to: null }, content: text };
  const [, fm, content] = m;
  const meta: PromptMeta = { label: '', hint: '', applies_to: null };
  for (const line of fm.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === 'label') meta.label = val;
    else if (key === 'hint') meta.hint = val;
    else if (key === 'applies_to') meta.applies_to = isPromptSourceType(val) ? val : null;
  }
  return { meta, content };
}

export function serializePromptFile(meta: PromptMeta, content: string): string {
  const lines = [`label: ${meta.label}`, `hint: ${meta.hint}`];
  if (meta.applies_to) lines.push(`applies_to: ${meta.applies_to}`);
  return `---\n${lines.join('\n')}\n---\n${content}`;
}

export async function renderPrompt(ctx: PromptContext, promptId: PromptId): Promise<string> {
  const path = promptPath(promptId);
  if (!existsSync(path)) throw new Error(`Unknown prompt id: ${promptId}`);
  const raw = await readFile(path, 'utf8');
  const { content: tpl } = parsePromptFile(raw);
  let out = tpl;
  for (const [key, value] of Object.entries(ctx)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}
