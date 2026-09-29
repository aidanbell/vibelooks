import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const path = process.env.DB_PATH ?? "data/vibelooks.db";
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);

db.exec(`
  PRAGMA journal_mode = WAL;

  -- One row per repo we've ever seen.
  CREATE TABLE IF NOT EXISTS repos (
    name TEXT PRIMARY KEY,
    discovered_at TEXT NOT NULL
  );

  -- Which agent signature found the repo, and on which day (UTC).
  CREATE TABLE IF NOT EXISTS repo_agents (
    name TEXT NOT NULL,
    agent TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (name, agent)
  );

  -- Commit-search windows already fetched, so discovery can resume.
  CREATE TABLE IF NOT EXISTS search_windows (
    agent TEXT NOT NULL,
    window_start TEXT NOT NULL,
    commits INTEGER NOT NULL,
    PRIMARY KEY (agent, window_start)
  );

  -- package.json analysis. data is NULL when the repo has no frontend or is gone.
  CREATE TABLE IF NOT EXISTS packages (
    name TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL,
    frontend INTEGER NOT NULL,
    data TEXT
  );

  -- Styling extraction for frontend repos. data is NULL when nothing could be read.
  CREATE TABLE IF NOT EXISTS styles (
    name TEXT PRIMARY KEY,
    scanned_at TEXT NOT NULL,
    data TEXT
  );
`);

// Added after the first crawl: the SHA of the commit that got the repo discovered.
// Files are read at this commit so historical repos are seen as they were then.
if (!db.prepare("SELECT 1 FROM pragma_table_info('repos') WHERE name = 'sha'").get()) {
  db.exec("ALTER TABLE repos ADD COLUMN sha TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS repos_sha ON repos (sha)");

export const now = () => new Date().toISOString();
