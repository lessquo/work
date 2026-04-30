import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), 'data', 'app.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('github_pr','jira_issue','sentry_issue')),
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, external_id)
);

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('github_pr','jira_issue','sentry_issue')),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_items_source_type ON items(source_id, type);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'github_pr' CHECK (type IN ('github_pr','jira_issue','sentry_issue')),
  user_context TEXT,
  target_repo TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','aborted')),
  started_at TEXT,
  finished_at TEXT,
  branch TEXT,
  clone_path TEXT,
  log_path TEXT,
  exit_code INTEGER,
  error TEXT,
  pr_url TEXT,
  pr_body TEXT,
  prompt TEXT NOT NULL,
  claude_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_item ON sessions(item_id);
CREATE INDEX IF NOT EXISTS idx_items_workflow ON items(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workflow ON sessions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source_id);
`);

db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_parallel', '2')`).run();

export type ItemType = 'sentry_issue' | 'jira_issue' | 'github_pr';

const upsertItemStmt = db.prepare(`
  INSERT INTO items (source_id, type, external_id, url, raw, updated_at)
  VALUES (@source_id, @type, @external_id, @url, @raw, datetime('now'))
  ON CONFLICT(type, external_id) DO UPDATE SET
    source_id = excluded.source_id,
    url = excluded.url,
    raw = excluded.raw,
    updated_at = datetime('now')
`);

export const upsertItems = db.transaction(
  (type: ItemType, sourceId: number, rows: Array<{ external_id: string; url: string; raw: string }>) => {
    for (const r of rows) {
      upsertItemStmt.run({ source_id: sourceId, type, external_id: r.external_id, url: r.url, raw: r.raw });
    }
  },
);

const insertWorkflowStmt = db.prepare(`INSERT INTO workflows (name) VALUES (?)`);
const setSessionWorkflowStmt = db.prepare(`UPDATE sessions SET workflow_id = ? WHERE id = ?`);
const setItemWorkflowStmt = db.prepare(`UPDATE items SET workflow_id = ? WHERE id = ?`);
const getSessionItemIdStmt = db.prepare(`SELECT item_id FROM sessions WHERE id = ?`);
const getItemWorkflowIdStmt = db.prepare(`SELECT workflow_id FROM items WHERE id = ?`);

export const createWorkflowForSession = db.transaction((sessionId: number, name: string | null = null): number => {
  const row = getSessionItemIdStmt.get(sessionId) as { item_id: number | null } | undefined;
  if (row?.item_id) {
    const existing = getItemWorkflowIdStmt.get(row.item_id) as { workflow_id: number | null } | undefined;
    if (existing?.workflow_id) {
      setSessionWorkflowStmt.run(existing.workflow_id, sessionId);
      return existing.workflow_id;
    }
  }
  const res = insertWorkflowStmt.run(name);
  const workflowId = Number(res.lastInsertRowid);
  setSessionWorkflowStmt.run(workflowId, sessionId);
  if (row?.item_id) {
    setItemWorkflowStmt.run(workflowId, row.item_id);
  }
  return workflowId;
});

export const createWorkflowForItem = db.transaction((itemId: number, name: string | null = null): number => {
  const res = insertWorkflowStmt.run(name);
  const workflowId = Number(res.lastInsertRowid);
  setItemWorkflowStmt.run(workflowId, itemId);
  return workflowId;
});

export type Source = {
  id: number;
  type: ItemType;
  external_id: string;
  created_at: string;
};

export type Item = {
  id: number;
  source_id: number;
  workflow_id: number | null;
  type: ItemType;
  external_id: string;
  url: string;
  raw: string;
  created_at: string;
  updated_at: string;
};

export type Workflow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SessionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted';

export type Session = {
  id: number;
  item_id: number | null;
  source_id: number | null;
  workflow_id: number | null;
  type: ItemType;
  user_context: string | null;
  target_repo: string | null;
  status: SessionStatus;
  started_at: string | null;
  finished_at: string | null;
  branch: string | null;
  clone_path: string | null;
  log_path: string | null;
  exit_code: number | null;
  error: string | null;
  pr_url: string | null;
  pr_body: string | null;
  prompt: string;
  claude_session_id: string | null;
  created_at: string;
};
