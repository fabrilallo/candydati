import { createDb } from '@candydati/db';
import { createS3FileStorage, loadS3Config } from '@candydati/providers';
import { parseSeedArgs } from './args.js';
import { runDemoSeed } from './run.js';
import { DemoSeedError } from './store/target.js';

/**
 * Demo data for one organization, from inside the api container (docs/demo.md):
 *   docker compose exec api node dist/demo-seed/cli.js --org <slug> --yes
 */
async function main(): Promise<number> {
  const args = parseSeedArgs(process.argv.slice(2), process.env);
  if (!args.ok) {
    process.stderr.write(`${args.message}\n`);
    return 2;
  }
  const database = createDb(args.value.databaseUrl, 2);
  try {
    const files = createS3FileStorage(loadS3Config(process.env));
    if (args.value.apply) await files.ensureBucket();
    await runDemoSeed({ db: database.db, files, organization: args.value.organization, apply: args.value.apply, log: (line) => process.stdout.write(`${line}\n`) });
    return 0;
  } finally {
    await database.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof DemoSeedError ? error.message : `Demo seed failed: ${error instanceof Error ? error.message : String(error)}`;
    process.stderr.write(`${message}\n`);
    process.exit(1);
  },
);
