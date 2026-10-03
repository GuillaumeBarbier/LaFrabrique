import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations";

export type DB = Database.Database;

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "./data");
}

export function migrate(db: DB): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => (r as { version: number }).version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
    })();
  }
}

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __lafabriqueDb?: DB };

/** Process-wide connection, migrated on first use (survives dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__lafabriqueDb) {
    globalForDb.__lafabriqueDb = openDatabase(path.join(dataDir(), "lafabrique.db"));
  }
  return globalForDb.__lafabriqueDb;
}

/** Tests only: swap the process-wide connection. */
export function setDbForTests(db: DB): void {
  globalForDb.__lafabriqueDb = db;
}
