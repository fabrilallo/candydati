import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, renderEnvDocs } from './generate.mjs';

writeFileSync(join(ROOT, 'docs', 'ENVIRONMENT.md'), renderEnvDocs());
