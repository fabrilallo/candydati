import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env-docs/generate.mjs';
import { renderTemplate, TEMPLATE_DIR } from './generate.mjs';

const dir = join(ROOT, TEMPLATE_DIR);
const { compose, config, base64 } = renderTemplate();
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'docker-compose.yml'), compose);
writeFileSync(join(dir, 'template.toml'), config);
writeFileSync(join(dir, 'template.base64'), base64);
