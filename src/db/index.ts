import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function assertProductionDatabaseConfigured(): void {
  if (isProductionRuntime() && !hasDatabaseUrl()) {
    throw new Error(
      'FATAL: DATABASE_URL is required in production. Ephemeral local JSON storage is disabled.'
    );
  }
}

export function getDb() {
  assertProductionDatabaseConfigured();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  if (!poolInstance) {
    const needsSsl =
      url.includes('sslmode=require') ||
      url.includes('neon.tech') ||
      url.includes('vercel-storage.com') ||
      url.includes('supabase.co') ||
      isProductionRuntime();

    poolInstance = new Pool({
      connectionString: url,
      max: 10,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  if (!dbInstance) {
    dbInstance = drizzle(poolInstance, { schema });
  }

  return dbInstance;
}
