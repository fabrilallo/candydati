import { createDb, runMigrations } from '@tt/db';
import { createS3FileStorage } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import { loadEnv } from './config/env.js';
import { createErrorReporter, createPgBossQueue, withRequestId, type ErrorReporter } from '@tt/providers';
import { safeErrorSerializer } from '@tt/core';
import { buildServer } from './server.js';

const PG_BOSS_SCHEMA = 'pgboss';

/** A crash is logged and reported before the process goes down, as Node would do by itself. */
function reportFatalErrors(reporter: ErrorReporter, log: (error: unknown, origin: string) => void): void {
  const crash = (origin: string) => (error: unknown) => {
    log(error, origin);
    reporter.capture(error, { service: 'api' });
    setTimeout(() => process.exit(1), 1_000).unref();
  };
  process.on('uncaughtException', crash('uncaughtException'));
  process.on('unhandledRejection', crash('unhandledRejection'));
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.RUN_MIGRATIONS) await runMigrations(env.DATABASE_URL);
  const database = createDb(env.DATABASE_URL);
  const files = createS3FileStorage(env.s3);
  await files.ensureBucket();
  // The api only sends jobs: the worker owns scheduling and maintenance.
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: PG_BOSS_SCHEMA, schedule: false, supervise: false });
  await boss.start();
  const errorReporter = createErrorReporter({
    dsn: env.observability.sentryDsn,
    service: 'api',
    environment: env.observability.sentryEnvironment ?? env.NODE_ENV,
    release: env.observability.sentryRelease ?? undefined,
    describe: safeErrorSerializer,
    onProblem: (reason) => process.stderr.write(`error reporting: ${reason}\n`),
  });
  // Jobs queued while answering a request carry its id: the worker logs it, so a request can be followed into its jobs.
  const queue = withRequestId(createPgBossQueue(boss));
  const app = await buildServer({ env, db: database.db, files, queue, errorReporter, checkQueue: async () => void (await boss.getQueues()) });
  reportFatalErrors(errorReporter, (error, origin) => app.log.fatal({ err: error, origin }, 'fatal error'));
  boss.on('error', (error: Error) => app.log.error({ err: error }, 'pg-boss error'));
  if (env.RUN_MIGRATIONS) app.log.info('database migrations applied');

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await boss.stop({ graceful: true, timeout: 10_000 });
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
