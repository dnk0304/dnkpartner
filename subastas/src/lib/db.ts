import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const globalForDb = globalThis as unknown as {
  db: Database.Database | undefined;
};

// SQLite setup - direct connection with better-sqlite3
const dbPath = path.join(process.cwd(), 'data', 'database', 'prod.db');

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create or reuse database connection
export const db = globalForDb.db ?? new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Enable foreign keys and optimize for performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Reuse connection in development to prevent too many connections
if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}

// Helper function to run queries safely
export function query<T>(sql: string, params: any[] = []): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch (error) {
    console.error('Database query error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

export function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

export function execute(sql: string, params: any[] = []): Database.RunResult {
  try {
    return db.prepare(sql).run(...params);
  } catch (error) {
    console.error('Database execute error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}
