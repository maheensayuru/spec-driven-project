import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as postgresDrizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as pgliteDrizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
type SelectedDatabase =
  | { backend: 'postgres'; client: pg.Pool; db: NodePgDatabase<typeof schema> }
  | { backend: 'pglite'; client: PGlite; db: PgliteDatabase<typeof schema> };
const unavailableCodes: Record<string, true> = {
  ECONNREFUSED: true,
  ETIMEDOUT: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
};

function isTransportUnavailable(error: unknown): boolean {
  if (error instanceof AggregateError) return error.errors.length > 0 && error.errors.every(isTransportUnavailable);
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: string; message?: string; cause?: unknown };
  return (failure.code !== undefined && unavailableCodes[failure.code] === true) ||
    failure.message === 'Connection terminated due to connection timeout' ||
    (failure.cause !== undefined && isTransportUnavailable(failure.cause));
}

async function openEmbedded(inMemory = false): Promise<SelectedDatabase> {
  const directory = path.isAbsolute(env.PGLITE_DATA_DIR) ? env.PGLITE_DATA_DIR : path.resolve(backendRoot, env.PGLITE_DATA_DIR);
  const client = new PGlite(inMemory ? undefined : directory);
  try {
    await client.waitReady;
    return { backend: 'pglite', client, db: pgliteDrizzle(client, { schema }) };
  } catch (error) {
    await client.close();
    throw error;
  }
}

async function selectDatabase(): Promise<SelectedDatabase> {
  // Unconfigured unit-test imports must never connect to shared development data.
  if (env.NODE_ENV === 'test' && env.DATABASE_MODE === 'auto') return openEmbedded(true);
  if (env.DATABASE_MODE === 'pglite') {
    if (env.NODE_ENV === 'production') throw new Error('PGlite is a development-only database backend.');
    return openEmbedded();
  }
  const client = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  try {
    await client.query('SELECT 1');
    return { backend: 'postgres', client, db: postgresDrizzle(client, { schema }) };
  } catch (error) {
    await client.end();
    if (env.DATABASE_MODE !== 'auto' || env.NODE_ENV === 'production' || !isTransportUnavailable(error)) throw error;
    console.info('[database] PostgreSQL is unavailable; using the durable development PGlite database.');
    return openEmbedded();
  }
}

export const database = await selectDatabase();
export const databaseBackend = database.backend;
export const db: PgDatabase<PgQueryResultHKT, typeof schema> = database.db;
let closePromise: Promise<void> | undefined;
export function closeDatabase(): Promise<void> {
  closePromise ??= database.backend === 'postgres' ? database.client.end() : database.client.close();
  return closePromise;
}
