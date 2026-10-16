import { parseMigrationPackage, type MigrationPackageInput } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../import/index.js';
import { detectColumns } from './columns.js';
import { ASSUMED_HEADERS, ASSUMED_ROWS, assumedCsv, csvOf } from './inrecruiting-fixtures.js';
import { mapSheet } from './map.js';

const EXPORTED = '2026-10-16T10:00:00.000Z';
const mapped = (headers: readonly string[] = ASSUMED_HEADERS, rows: readonly (readonly string[])[] = ASSUMED_ROWS) => {
  const table = parseCsv(csvOf(headers, rows));
  return mapSheet(table.rows, detectColumns(table.headers), EXPORTED);
};

describe('mapSheet', () => {
  const result = mapped();

  it('groups jobs by title and code, with stages in order of first appearance and outcome words left out', () => {
    expect(result.jobs.map((job) => [job.ref, job.title, job.status, job.stages.map((stage) => stage.name)])).toEqual([
      ['job-1', 'Backend Developer', 'draft', ['Colloquio HR']],
      ['job-2', 'Designer', 'draft', ['Candidatura', 'Colloquio tecnico', 'Colloquio HR']],
    ]);
    // A job with an undecided application is a draft, never published by the migration.
    expect(result.jobs[0]).toMatchObject({ createdAt: '2025-03-14T00:00:00.000Z' });
    expect(result.jobs[0]).not.toHaveProperty('closedAt');
  });

  it('makes one application per row, merging people by email (any case) or by name, and drops a repeated person for a job', () => {
    expect(result.candidates.map((c) => [c.firstName, c.lastName, c.email ?? null])).toEqual([
      ['Mario', 'Rossi', 'mario.rossi@example.com'],
      ['Anna', 'Bianchi', 'anna.bianchi@example.com'],
      ['Luca', 'Verdi', 'luca.verdi@example.com'],
      ['Giulia', 'Neri', null],
      ['Paolo', 'Gialli', 'paolo.gialli@example.com'],
      ['Elena', 'Blu', null],
    ]);
    expect(result.applications).toHaveLength(7);
    expect(result.applications.filter((a) => a.candidateRef === 'candidate-1').map((a) => a.jobRef)).toEqual(['job-1', 'job-2']);
    expect(result.notices).toContainEqual({ code: 'rows_duplicate', count: 1 });
    expect(result.notices).toContainEqual({ code: 'rows_skipped', count: 1 });
  });

  it('reads outcomes from the outcome column or from a status word, and closes them with the row date', () => {
    const byRef = Object.fromEntries(result.applications.map((a) => [a.ref, a]));
    expect(byRef['application-1']).not.toHaveProperty('outcome');
    // Status "Assunto": hired, in the job's last stage (there is only one), closed on the row date.
    expect(byRef['application-2']).toMatchObject({ outcome: 'hired', stageRef: 'job-1-s1', createdAt: '2025-04-02T00:00:00.000Z', closedAt: '2025-04-02T00:00:00.000Z' });
    expect(byRef['application-3']).toMatchObject({ outcome: 'not_selected', stageRef: 'job-1-s1' });
    expect(byRef['application-4']).toMatchObject({ outcome: 'withdrawn', stageRef: 'job-2-s1' });
  });

  it('carries phone, notes, tags and source, and never a score or an unknown column', () => {
    expect(result.candidates[0]).toMatchObject({ phone: '+39 333 1234567', tags: ['node', 'senior'], createdAt: '2025-03-14T00:00:00.000Z' });
    expect(result.candidates[3]?.phone).toBe('329 1234567');
    expect(result.applications[0]).toMatchObject({ origin: 'LinkedIn' });
    expect(result.notes.map((n) => [n.applicationRef, n.body])).toEqual([['application-1', 'Buon profilo'], ['application-3', 'Non allineato']]);
    const everything = JSON.stringify({ ...result, notices: [] });
    for (const leaked of ['4/5', 'Taglia scarpe', 'Valutazione']) expect(everything).not.toContain(leaked);
  });

  it('reports unrecognised and ignored columns by header, and values it had to drop, by count', () => {
    expect(result.notices).toEqual([
      { code: 'columns_unrecognized', count: 1, headers: ['Taglia scarpe'] },
      { code: 'columns_ignored', count: 1, headers: ['Valutazione'] },
      { code: 'rows_skipped', count: 1 },
      { code: 'rows_duplicate', count: 1 },
      // an invalid phone, a nonexistent date (31/02), and an invalid email
      { code: 'values_dropped', count: 3 },
    ]);
  });

  it('closes a job once every application is decided, on the date of the last one', () => {
    const done = mapped(['Nome e cognome', 'Posizione', 'Fase', 'Data', 'Esito'], [['Ada Lovelace', 'Analyst', 'Colloquio', '01/02/2025', 'Scartata'], ['Alan Turing', 'Analyst', 'Offerta', '15/03/2025', 'Assunto']]);
    expect(done.jobs[0]).toMatchObject({ status: 'closed', createdAt: '2025-02-01T00:00:00.000Z', closedAt: '2025-03-15T00:00:00.000Z', stages: [{ name: 'Colloquio' }, { name: 'Offerta' }] });
    expect(done.applications.map((a) => a.stageRef)).toEqual(['job-1-s1', 'job-1-s2']);
  });

  it('uses the export time for a row without a date, and a default stage for a job without stages', () => {
    const sparse = mapped(['Nome e cognome', 'Posizione', 'Esito'], [['Ada Lovelace', 'Analyst', 'Assunta']]);
    expect(sparse.jobs[0]).toMatchObject({ status: 'closed', createdAt: EXPORTED, closedAt: EXPORTED, stages: [{ ref: 'job-1-s1', name: 'Candidatura' }] });
    expect(sparse.applications[0]).toMatchObject({ stageRef: 'job-1-s1', createdAt: EXPORTED, closedAt: EXPORTED, outcome: 'hired' });
  });

  it('splits a full name column, and skips a row whose name has no surname', () => {
    const named = mapped(['Nominativo', 'Posizione'], [['ROSSI Mario', 'Analyst'], ['Madonna', 'Analyst']]);
    expect(named.candidates.map((c) => [c.firstName, c.lastName])).toEqual([['Mario', 'ROSSI']]);
    expect(named.notices).toContainEqual({ code: 'rows_skipped', count: 1 });
  });

  it('builds a package the product accepts', () => {
    const manifest: MigrationPackageInput = {
      format: 'candydati-migration',
      version: 1,
      source: { system: 'inrecruiting', producer: 'connector:inrecruiting@1', exportedAt: EXPORTED },
      jobs: [...result.jobs],
      candidates: [...result.candidates],
      applications: result.applications.map((a) => ({ ...a, files: [] })),
      notes: [...result.notes],
    };
    const parsed = parseMigrationPackage(manifest);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('is deterministic for the same file', () => {
    const table = parseCsv(assumedCsv());
    const detection = detectColumns(table.headers);
    expect(mapSheet(table.rows, detection, EXPORTED)).toEqual(mapSheet(table.rows, detection, EXPORTED));
  });
});
