import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FILES_DIR, LIMITS, isFilePath } from './references.mjs';
import { listZip, readZipEntry } from './zip.mjs';

export const MANIFEST = 'migration.json';

/**
 * Reads a package from a folder or a ZIP. Returns `{ manifestText, files, problems, notes }`: `files` is the set of
 * paths found under `files/`, `problems` are structural errors, `notes` are warnings.
 */
export function readPackage(target) {
  const stats = statSync(target);
  return stats.isDirectory() ? readFolder(target) : readArchive(target);
}

function walkFiles(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
    return entry.isDirectory() ? walkFiles(root, relative) : [relative];
  });
}

function readFolder(folder) {
  const problems = [];
  const notes = [];
  const names = readdirSync(folder);
  for (const name of names) {
    if (name !== MANIFEST && name !== 'files') notes.push(`"${name}" is not part of a package: zip only ${MANIFEST} and files/`);
  }
  if (!names.includes(MANIFEST)) return { manifestText: undefined, files: new Set(), problems: [`${MANIFEST} is missing at the root of the folder`], notes };
  const files = new Set(names.includes('files') ? walkFiles(folder, 'files') : []);
  let total = 0;
  for (const path of files) total += statSync(join(folder, path)).size;
  if (total > LIMITS.totalBytes) problems.push('the files add up to more than 1 GiB: split the account into several packages');
  return { manifestText: readFileSync(join(folder, MANIFEST), 'utf8'), files, problems, notes };
}

function readArchive(path) {
  const buffer = readFileSync(path);
  const problems = [];
  const files = new Set();
  const seen = new Set();
  let manifestEntry;
  let total = 0;
  for (const entry of listZip(buffer)) {
    if (entry.name.endsWith('/')) continue;
    total += entry.size;
    if (seen.has(entry.name)) problems.push(`the ZIP has "${entry.name}" twice`);
    seen.add(entry.name);
    if (entry.symlink) problems.push(`"${entry.name}" is a link, which is not allowed`);
    if (entry.name === MANIFEST) manifestEntry = entry;
    else if (!isFilePath(entry.name)) problems.push(`"${entry.name}" is not allowed: a ZIP holds only ${MANIFEST} and safe paths under ${FILES_DIR}`);
    else files.add(entry.name);
  }
  if (total > LIMITS.totalBytes) problems.push('the ZIP expands to more than 1 GiB: split the account into several packages');
  if (manifestEntry === undefined) problems.push(`${MANIFEST} is missing at the root of the ZIP`);
  const manifestText = manifestEntry === undefined ? undefined : readZipEntry(buffer, manifestEntry).toString('utf8');
  return { manifestText, files, problems, notes: [] };
}
