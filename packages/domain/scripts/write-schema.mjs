// Writes the public, versioned schemas (job ad, candidate export) to docs/schema. Run with `pnpm --filter @candydati/domain schema`.
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateExportJsonSchema, jobContentJsonSchema } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../docs/schema');
const files = {
  'job-content.v1.json': jobContentJsonSchema(),
  'candidate-export.v1.json': candidateExportJsonSchema(),
};

mkdirSync(outDir, { recursive: true });
for (const [name, schema] of Object.entries(files)) {
  const file = resolve(outDir, name);
  writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
  process.stdout.write(`Schema written to ${file}\n`);
}
