import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { BOOTSTRAP_SQL } from '../../src/db/bootstrap.js';
import * as schema from '../../src/db/schema/index.js';

export const testClient = new PGlite();
await testClient.waitReady;
await testClient.exec(BOOTSTRAP_SQL);

export const testDb: PgliteDatabase<typeof schema> = drizzle(testClient, { schema });

export async function resetTestDatabase(): Promise<void> {
  await testClient.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await testClient.exec(BOOTSTRAP_SQL);
}
