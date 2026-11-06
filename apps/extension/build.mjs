// Builds the extension into dist/ (and dist/candydati-extension-<version>.zip with --zip).
// CANDYDATI_ORIGINS: the origins of the Candydati app it answers (comma-separated, `https://*.domain` allowed). The
// default is the hosted Candydati; a self-hosted instance on its own domain builds its own extension with its origin.
// CANDYDATI_EXTENSION_DEV=1 also answers http://localhost:3000 (development only, never in the store build).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const version = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;
const hosted = process.env.CANDYDATI_ORIGINS ?? 'https://*.candydati.it,https://*.candydati.com';
const origins = process.env.CANDYDATI_EXTENSION_DEV === '1' ? `${hosted},http://localhost:3000` : hosted;

// The manifest helpers are TypeScript: bundle them once for this script.
await build({ entryPoints: [`${root}src/manifest.ts`], outfile: `${root}.build/manifest.mjs`, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { buildManifest, parseOrigins } = await import(`${root}.build/manifest.mjs`);
const allowed = parseOrigins(origins);

rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist`, { recursive: true });
await build({
  entryPoints: [`${root}src/background.ts`],
  outfile: `${root}dist/background.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  minify: true,
  legalComments: 'none',
  define: { __CANDYDATI_ORIGINS__: JSON.stringify(allowed) },
});
cpSync(`${root}icons`, `${root}dist/icons`, { recursive: true });
writeFileSync(`${root}dist/manifest.json`, `${JSON.stringify(buildManifest(version, allowed), null, 2)}\n`);
rmSync(`${root}.build`, { recursive: true, force: true });

if (process.argv.includes('--zip')) {
  const zip = `candydati-extension-${version}.zip`;
  execFileSync('zip', ['-qr', zip, 'manifest.json', 'background.js', 'icons'], { cwd: `${root}dist` });
  process.stdout.write(`dist/${zip}\n`);
}
