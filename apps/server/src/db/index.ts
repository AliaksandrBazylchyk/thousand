import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(file: string, migrationsFolder: string) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof openDb>;

/** Папка миграций: рядом с исходниками в dev и рядом с бандлом в dist. */
export function defaultMigrationsFolder(): string {
  return (
    process.env.MIGRATIONS_DIR ?? resolve(here, here.endsWith('dist') ? '..' : '../..', 'drizzle')
  );
}

export { schema };
