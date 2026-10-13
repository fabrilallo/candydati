import { createDb, runMigrations } from '@tt/db';
import { loadEnv } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.RUN_MIGRATIONS) await runMigrations(env.DATABASE_URL);
  const database = createDb(env.DATABASE_URL);
  const app = await buildServer({ env, db: database.db });
  if (env.RUN_MIGRATIONS) app.log.info('database migrations applied');

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await database.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info({ platform: env.platform.name }, 'api ready');
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal startup error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
