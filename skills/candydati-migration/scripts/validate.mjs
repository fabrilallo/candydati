#!/usr/bin/env node
/**
 * Validates a Candydati migration package (a folder or a ZIP) offline: the JSON Schema, then the cross-reference rules,
 * then the files. Usage: node validate.mjs <folder-or-zip> [--json]. Exit code 0 when valid, 1 otherwise.
 * No network, no dependencies: needs Node 24 or newer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPath, validateSchema } from './lib/json-schema.mjs';
import { checkReferences } from './lib/references.mjs';
import { readPackage } from './lib/source.mjs';

const SCHEMA_FILE = join(dirname(fileURLToPath(import.meta.url)), 'migration-package.v1.json');

const toLine = (issue) => `${formatPath(issue.path)}: ${issue.message}`;

/** Validates a package at `target`; returns `{ ok, errors, warnings, counts }`. */
export function validatePackage(target) {
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
  const source = readPackage(target);
  const errors = [...source.problems];
  const warnings = [...source.notes];
  if (source.manifestText === undefined) return { ok: false, errors, warnings, counts: {} };
  let manifest;
  try {
    manifest = JSON.parse(source.manifestText);
  } catch (error) {
    return { ok: false, errors: [...errors, `migration.json is not valid JSON: ${error.message}`], warnings, counts: {} };
  }
  errors.push(...validateSchema(schema, manifest).map(toLine));
  const { issues, filePaths } = checkReferences(manifest);
  errors.push(...issues.map(toLine));
  for (const path of filePaths) {
    if (!source.files.has(path)) errors.push(`${path}: named in migration.json but not found in the package`);
  }
  for (const path of source.files) {
    if (!filePaths.has(path)) warnings.push(`${path}: not used by any application (it will be ignored)`);
  }
  const counts = Object.fromEntries(
    ['users', 'jobs', 'candidates', 'applications', 'notes', 'messages'].map((key) => [key, Array.isArray(manifest[key]) ? manifest[key].length : 0]),
  );
  return { ok: errors.length === 0, errors, warnings, counts: { ...counts, files: filePaths.size } };
}

function main(argv) {
  const args = argv.filter((arg) => !arg.startsWith('--'));
  const asJson = argv.includes('--json');
  if (args.length !== 1) {
    console.error('Usage: node validate.mjs <package-folder-or-zip> [--json]');
    return 1;
  }
  let result;
  try {
    result = validatePackage(args[0]);
  } catch (error) {
    result = { ok: false, errors: [`cannot read the package: ${error.message}`], warnings: [], counts: {} };
  }
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
  return result.ok ? 0 : 1;
}

function printReport({ ok, errors, warnings, counts }) {
  for (const line of errors) console.error(`ERROR   ${line}`);
  for (const line of warnings) console.error(`WARNING ${line}`);
  const summary = Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(', ');
  if (ok) console.log(`Valid package: ${summary}.`);
  else console.error(`Invalid package: ${errors.length} error(s). Fix them and run the validation again.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
