// Writes the public, versioned job ad schema to docs/schema. Run with `pnpm --filter @tt/domain schema`.
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobContentJsonSchema } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../../../docs/schema/job-content.v1.json');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(jobContentJsonSchema(), null, 2)}\n`);
process.stdout.write(`Schema written to ${outFile}\n`);
