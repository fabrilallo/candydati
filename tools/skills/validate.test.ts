import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = join(ROOT, 'skills', 'candydati-migration');
const VALIDATE = join(SKILL, 'scripts', 'validate.mjs');
const work = mkdtempSync(join(tmpdir(), 'candydati-skill-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

type Manifest = Record<string, unknown>;
type Row = Record<string, unknown>;

/** The `index`-th record of a collection of the manifest, to edit it in a test. */
const row = (manifest: Manifest, collection: string, index = 0): Row => (manifest[collection] as Row[])[index] as Row;

const validManifest = (): Manifest => ({
  format: 'candydati-migration',
  version: 1,
  source: { system: 'example-ats', exportedAt: '2026-10-01T10:00:00Z', producer: 'skill:candydati-migration@1' },
  users: [{ ref: 'u1', name: 'Giulia Bianchi', email: 'giulia@example.com' }],
  jobs: [
    {
      ref: 'j1',
      title: 'Backend developer',
      status: 'closed',
      createdAt: '2025-01-10T09:00:00Z',
      closedAt: '2025-04-01T09:00:00Z',
      stages: [
        { ref: 's1', name: 'Applied' },
        { ref: 's2', name: 'Technical interview', type: 'technical_interview' },
      ],
    },
  ],
  candidates: [
    {
      ref: 'c1',
      firstName: 'Marco',
      lastName: 'Rossi',
      email: 'marco@example.com',
      createdAt: '2025-01-15T12:00:00Z',
      consent: { givenAt: '2025-01-15T12:00:00Z', expiresAt: '2027-01-15T12:00:00Z', scopes: ['selection'] },
    },
  ],
  applications: [
    {
      ref: 'a1',
      candidateRef: 'c1',
      jobRef: 'j1',
      stageRef: 's2',
      createdAt: '2025-01-15T12:00:00Z',
      outcome: 'not_selected',
      closedAt: '2025-03-01T12:00:00Z',
      files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }],
      stageHistory: [{ stageRef: 's1', enteredAt: '2025-01-15T12:00:00Z' }, { stageRef: 's2', enteredAt: '2025-02-01T12:00:00Z' }],
    },
  ],
  notes: [{ candidateRef: 'c1', applicationRef: 'a1', authorRef: 'u1', body: 'Good conversation.', createdAt: '2025-02-02T12:00:00Z' }],
  messages: [{ applicationRef: 'a1', direction: 'outbound', at: '2025-03-01T12:00:00Z', subject: 'Outcome', body: 'Thank you.' }],
});

let counter = 0;
/** Writes a package folder; `files` maps a path inside the folder to its content. */
function makeFolder(manifest: Manifest, files: Record<string, string> = { 'files/a1/cv.pdf': '%PDF-1.4 test' }): string {
  const dir = join(work, `pkg-${(counter += 1)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'migration.json'), JSON.stringify(manifest));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** A ZIP with stored (uncompressed) entries, written by hand so the test needs no tool. */
function makeZip(entries: Record<string, string>): string {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, data);
    centrals.push(central, nameBuffer);
    offset += 30 + nameBuffer.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const path = join(work, `pkg-${(counter += 1)}.zip`);
  writeFileSync(path, Buffer.concat([...locals, directory, end]));
  return path;
}

const run = (...args: string[]) => {
  const result = spawnSync('node', [VALIDATE, ...args], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

describe('validate.mjs', () => {
  it('accepts a valid package folder', () => {
    const result = run(makeFolder(validManifest()));
    expect(result.code).toBe(0);
    expect(result.out).toContain('Valid package: 1 users, 1 jobs, 1 candidates, 1 applications, 1 notes, 1 messages, 1 files.');
  });

  it('accepts a valid ZIP', () => {
    const zip = makeZip({ 'migration.json': JSON.stringify(validManifest()), 'files/a1/cv.pdf': '%PDF-1.4 test' });
    expect(run(zip).code).toBe(0);
  });

  it('prints machine-readable output with --json', () => {
    const result = run(makeFolder(validManifest()), '--json');
    expect(JSON.parse(result.out)).toMatchObject({ ok: true, errors: [] });
  });

  it('refuses a score hidden in an application, with its path', () => {
    const manifest = validManifest();
    row(manifest, 'applications', 0)['score'] = 4;
    const result = run(makeFolder(manifest));
    expect(result.code).toBe(1);
    expect(result.err).toContain('applications[0].score: is not allowed');
  });

  it.each(['birthDate', 'gender', 'photoUrl', 'rating'])('refuses the forbidden candidate field %s', (field) => {
    const manifest = validManifest();
    row(manifest, 'candidates', 0)[field] = 'x';
    const result = run(makeFolder(manifest));
    expect(result.code).toBe(1);
    expect(result.err).toContain(`candidates[0].${field}: is not allowed`);
  });

  it('refuses a wrong type, a missing field and a date without time zone', () => {
    const manifest = validManifest();
    row(manifest, 'jobs', 0)['status'] = 'archived';
    delete row(manifest, 'candidates', 0)['lastName'];
    row(manifest, 'candidates', 0)['createdAt'] = '2025-01-15';
    const result = run(makeFolder(manifest));
    expect(result.code).toBe(1);
    expect(result.err).toContain('jobs[0].status: must be one of: draft, open, closed');
    expect(result.err).toContain('candidates[0].lastName: is required');
    expect(result.err).toContain('candidates[0].createdAt: must be an ISO 8601 date');
  });

  it('refuses a broken reference', () => {
    const manifest = validManifest();
    row(manifest, 'applications', 0)['candidateRef'] = 'nobody';
    row(manifest, 'applications', 0)['stageRef'] = 'nowhere';
    row(manifest, 'notes', 0)['authorRef'] = 'ghost';
    const result = run(makeFolder(manifest));
    expect(result.code).toBe(1);
    expect(result.err).toContain('applications[0].candidateRef: no candidate has ref "nobody"');
    expect(result.err).toContain('applications[0].stageRef: "nowhere" is not a stage of job "j1"');
    expect(result.err).toContain('notes[0].authorRef: no user has ref "ghost"');
  });

  it('refuses duplicate refs and an outcome without a closing date', () => {
    const manifest = validManifest();
    (manifest['candidates'] as Row[]).push({ ...row(manifest, 'candidates') });
    delete row(manifest, 'applications', 0)['closedAt'];
    const result = run(makeFolder(manifest));
    expect(result.err).toContain('candidates[1].ref: duplicate ref "c1"');
    expect(result.err).toContain('applications[0].closedAt: closedAt is required when there is an outcome');
  });

  it.each(['../secret.pdf', 'files/../secret.pdf', 'docs/cv.pdf', '/etc/passwd', 'files\\cv.pdf'])('refuses the file path %s', (path) => {
    const manifest = validManifest();
    (row(manifest, 'applications')['files'] as Row[])[0]!['path'] = path;
    const result = run(makeFolder(manifest));
    expect(result.code).toBe(1);
    expect(result.err).toContain('applications[0].files[0].path:');
    expect(result.err).toContain('is not a safe path under files/');
  });

  it('refuses a file named in the manifest but missing from the package', () => {
    const result = run(makeFolder(validManifest(), {}));
    expect(result.code).toBe(1);
    expect(result.err).toContain('files/a1/cv.pdf: named in migration.json but not found');
  });

  it('refuses a ZIP with a file outside files/', () => {
    const zip = makeZip({ 'migration.json': JSON.stringify(validManifest()), 'files/a1/cv.pdf': 'x', 'notes.txt': 'x' });
    const result = run(zip);
    expect(result.code).toBe(1);
    expect(result.err).toContain('"notes.txt" is not allowed');
  });

  it('refuses a ZIP without migration.json and input that is not JSON', () => {
    expect(run(makeZip({ 'files/a.pdf': 'x' })).err).toContain('migration.json is missing');
    const dir = makeFolder(validManifest());
    writeFileSync(join(dir, 'migration.json'), '{ nope');
    expect(run(dir).err).toContain('migration.json is not valid JSON');
  });

  it('warns about unused files without failing', () => {
    const result = run(makeFolder(validManifest(), { 'files/a1/cv.pdf': 'x', 'files/extra.pdf': 'x' }));
    expect(result.code).toBe(0);
    expect(result.err).toContain('files/extra.pdf: not used by any application');
  });

  it('fails with usage and with an unreadable target', () => {
    expect(run().code).toBe(1);
    expect(run(join(work, 'missing')).err).toContain('cannot read the package');
  });
});

describe('the skill folder', () => {
  it('ships the same schema as docs/schema', () => {
    const published = readFileSync(join(ROOT, 'docs', 'schema', 'migration-package.v1.json'), 'utf8');
    expect(readFileSync(join(SKILL, 'scripts', 'migration-package.v1.json'), 'utf8')).toBe(published);
  });

  it('has a SKILL.md whose frontmatter names the skill after its folder', () => {
    const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
    expect(text).toMatch(/^---\nname: candydati-migration\ndescription: .{40,}\n---\n/);
  });
});
