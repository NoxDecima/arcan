import Database from "better-sqlite3";
import { env } from "./env.js";

function resolveSqlitePath(url: string): string {
  // Accept "file:./auth.sqlite" or "file:/data/auth.sqlite"
  if (!url.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL scheme: ${url} (expected file:)`);
  }
  return url.slice("file:".length);
}

export function createDatabase() {
  const path = resolveSqlitePath(env.DATABASE_URL);
  const db = new Database(path);
  // Pragmas chosen for write-heavy app with single writer process:
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export type DB = ReturnType<typeof createDatabase>;
