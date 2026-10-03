import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations";

export type DB = Database.Database;

export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");
}

export function migrate(db: DB): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => (r as { version: number }).version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    // SQLite ignores this pragma inside a transaction: switch it around the migration.
    if (m.rebuildsTables) db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(m.sql);
        if (m.rebuildsTables) {
          const broken = db.pragma("foreign_key_check") as unknown[];
          if (broken.length > 0) throw new Error(`Migration ${m.version}: ${broken.length} broken foreign key(s)`);
        }
        db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
          m.version,
          m.name,
          new Date().toISOString(),
        );
      })();
    } finally {
      if (m.rebuildsTables) db.pragma("foreign_keys = ON");
    }
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
