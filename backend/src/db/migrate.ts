import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { BOOTSTRAP_SQL } from './bootstrap.js';
import { closeDatabase, database, databaseBackend } from './client.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function migrateDatabase(): Promise<void> {
  if (database.backend === 'postgres') {
    await database.client.query(BOOTSTRAP_SQL);
    await migrateNodePostgres(database.db, { migrationsFolder });
  } else {
    await database.client.exec(BOOTSTRAP_SQL);
    await migratePglite(database.db, { migrationsFolder });
  }
}

const isDirectRun =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  migrateDatabase()
    .then(() => {
      console.log(`Database migrations applied using ${databaseBackend}.`);
    })
    .catch((error: unknown) => {
      console.error('Migration error:', error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
