import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), 'data', 'app.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, ext_id)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_items_source_type ON items(source_id, type);
CREATE INDEX IF NOT EXISTS idx_items_flow ON items(flow_id);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  ext_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_notes_item ON notes(item_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
  user_context TEXT,
  repo TEXT,
  status TEXT NOT NULL,
  branch TEXT,
  clone_path TEXT,
  log_path TEXT,
  error TEXT,
  pr_url TEXT,
  prompt TEXT NOT NULL,
  claude_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_item ON sessions(item_id);
CREATE INDEX IF NOT EXISTS idx_sessions_flow ON sessions(flow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source_id);
`);

db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_parallel', '2')`).run();
db.prepare(`INSERT OR IGNORE INTO sources (type, ext_id) VALUES ('notes', 'local')`).run();

// ---------- flows ----------

export type Flow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

const insertFlowStmt = db.prepare(`INSERT INTO flows (name) VALUES (?)`);
const setSessionFlowStmt = db.prepare(`UPDATE sessions SET flow_id = ? WHERE id = ?`);
const setItemFlowStmt = db.prepare(`UPDATE items SET flow_id = ? WHERE id = ?`);
const getSessionItemIdStmt = db.prepare(`SELECT item_id FROM sessions WHERE id = ?`);
const getItemFlowIdStmt = db.prepare(`SELECT flow_id FROM items WHERE id = ?`);

export const createFlowForSession = db.transaction(
  (sessionId: number, sourceItemId: number | null = null, name: string | null = null): number => {
    const itemId =
      sourceItemId ?? (getSessionItemIdStmt.get(sessionId) as { item_id: number | null } | undefined)?.item_id ?? null;
    if (itemId) {
      const existing = getItemFlowIdStmt.get(itemId) as { flow_id: number | null } | undefined;
      if (existing?.flow_id) {
        setSessionFlowStmt.run(existing.flow_id, sessionId);
        return existing.flow_id;
      }
    }
    const res = insertFlowStmt.run(name);
    const flowId = Number(res.lastInsertRowid);
    setSessionFlowStmt.run(flowId, sessionId);
    if (itemId) {
      setItemFlowStmt.run(flowId, itemId);
    }
    return flowId;
  },
);

export const createFlowForItem = db.transaction((itemId: number, name: string | null = null): number => {
  const res = insertFlowStmt.run(name);
  const flowId = Number(res.lastInsertRowid);
  setItemFlowStmt.run(flowId, itemId);
  return flowId;
});

// ---------- sources ----------

export type ItemType = 'sentry_issue' | 'jira_issue' | 'github_pr' | 'notes';

export type Source = {
  id: number;
  type: ItemType;
  ext_id: string;
  created_at: string;
};

export function getLocalNotesSourceId(): number {
  const row = db.prepare(`SELECT id FROM sources WHERE type = 'notes' AND ext_id = 'local'`).get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error('local notes source missing');
  return row.id;
}

// ---------- items ----------

export type Item = {
  id: number;
  source_id: number;
  flow_id: number | null;
  type: ItemType;
  ext_id: string;
  key: string;
  title: string;
  status: string;
  url: string;
  raw: string;
  created_at: string;
  updated_at: string;
};

const upsertItemStmt = db.prepare(`
  INSERT INTO items (source_id, type, ext_id, key, title, status, url, raw, updated_at)
  VALUES (@source_id, @type, @ext_id, @key, @title, @status, @url, @raw, datetime('now'))
  ON CONFLICT(type, ext_id) DO UPDATE SET
    source_id = excluded.source_id,
    key = excluded.key,
    title = excluded.title,
    status = excluded.status,
    url = excluded.url,
    raw = excluded.raw,
    updated_at = datetime('now')
`);

export const upsertItems = db.transaction(
  (
    type: ItemType,
    sourceId: number,
    rows: Array<{ ext_id: string; key: string; title: string; status: string; url: string; raw: string }>,
  ) => {
    for (const r of rows) {
      upsertItemStmt.run({
        source_id: sourceId,
        type,
        ext_id: r.ext_id,
        key: r.key,
        title: r.title,
        status: r.status,
        url: r.url,
        raw: r.raw,
      });
    }
  },
);

// ---------- notes ----------

export type Note = {
  id: number;
  item_id: number;
  ext_id: string;
  title: string;
  body_md: string;
  created_at: string;
  updated_at: string;
};

export function listNotes(itemId: number): Note[] {
  return db.prepare(`SELECT * FROM notes WHERE item_id = ? ORDER BY id ASC`).all(itemId) as Note[];
}

const upsertNoteStmt = db.prepare(`
  INSERT INTO notes (item_id, ext_id, title, body_md, updated_at)
  VALUES (@item_id, @ext_id, @title, @body_md, datetime('now'))
  ON CONFLICT(item_id, ext_id) DO UPDATE SET
    title = excluded.title,
    body_md = excluded.body_md,
    updated_at = datetime('now')
`);

const deleteNoteByExtStmt = db.prepare(`DELETE FROM notes WHERE item_id = ? AND ext_id = ?`);

export const syncNotesForItem = db.transaction(
  (itemId: number, rows: Array<{ ext_id: string; title: string; body_md: string }>) => {
    const keep = new Set(rows.map(r => r.ext_id));
    for (const r of rows) {
      upsertNoteStmt.run({ item_id: itemId, ext_id: r.ext_id, title: r.title, body_md: r.body_md });
    }
    const existing = db.prepare(`SELECT ext_id FROM notes WHERE item_id = ?`).all(itemId) as Array<{
      ext_id: string;
    }>;
    for (const e of existing) {
      if (!keep.has(e.ext_id)) deleteNoteByExtStmt.run(itemId, e.ext_id);
    }
  },
);

// ---------- sessions ----------

export type SessionStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'aborted';

export type Session = {
  id: number;
  item_id: number | null;
  source_id: number;
  flow_id: number | null;
  user_context: string | null;
  repo: string | null;
  status: SessionStatus;
  branch: string | null;
  clone_path: string | null;
  log_path: string | null;
  error: string | null;
  pr_url: string | null;
  prompt: string;
  claude_session_id: string | null;
  created_at: string;
  // Joined from sources.type — sessions never read the column directly; reads always
  // come through `selectSessionSql` so this is always populated.
  source_type: ItemType;
};

// Reusable SELECT fragment for sessions. All session reads must use this so `source_type`
// is consistently populated.
export const sessionColumns = `s.*, sr.type AS source_type`;
export const sessionFrom = `sessions s JOIN sources sr ON sr.id = s.source_id`;
