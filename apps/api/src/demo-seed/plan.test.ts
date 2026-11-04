import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from './build/dataset.js';
import { keysOf, ROW_TABLES, type DemoDataset } from './dataset.js';
import { describePlan, isNoop, planSeed, type ExistingKeys, type SingletonPlan } from './plan.js';
import { testContext } from '../testing/demo-seed.js';

const nothing = (): ExistingKeys => Object.fromEntries(ROW_TABLES.map((table) => [table, new Set<string>()])) as unknown as ExistingKeys;
const everything = (dataset: DemoDataset): ExistingKeys =>
  Object.fromEntries(ROW_TABLES.map((table) => [table, new Set(keysOf(dataset.rows, table))])) as unknown as ExistingKeys;
const FRESH: SingletonPlan = { privacyNotice: 'create', careersPage: 'create', agency: 'enable' };
const DONE: SingletonPlan = { privacyNotice: 'keep', careersPage: 'unchanged', agency: 'unchanged' };

describe('planSeed', () => {
  it('creates everything on an organization the seed never touched', async () => {
    const dataset = await buildDemoDataset(testContext());
    const plan = planSeed(dataset, nothing(), FRESH);
    expect(plan.rows).toEqual(dataset.rows);
    expect(plan.cvFiles).toHaveLength(dataset.rows.applications.length);
    expect(plan.counts.applications).toEqual({ create: dataset.rows.applications.length, existing: 0 });
    expect(isNoop(plan)).toBe(false);
  });

  it('creates nothing when everything is already there (a rerun)', async () => {
    const dataset = await buildDemoDataset(testContext());
    const plan = planSeed(dataset, everything(dataset), DONE);
    expect(ROW_TABLES.every((table) => plan.rows[table].length === 0)).toBe(true);
    expect(plan.cvFiles).toEqual([]);
    expect(isNoop(plan)).toBe(true);
  });

  it('fills in only what is missing, and uploads only the CVs of new applications', async () => {
    const dataset = await buildDemoDataset(testContext());
    const existing = everything(dataset);
    const [kept, ...dropped] = dataset.rows.applications.map((row) => row.id);
    const partial = { ...existing, applications: new Set([kept as string]), extractions: new Set<string>() };
    const plan = planSeed(dataset, partial, DONE);
    expect(plan.rows.applications.map((row) => row.id)).toEqual(dropped);
    expect(plan.cvFiles.map((file) => file.applicationId)).toEqual(dropped);
    expect(plan.rows.extractions).toHaveLength(dataset.rows.extractions.length);
    expect(plan.counts.jobs).toEqual({ create: 0, existing: dataset.rows.jobs.length });
  });

  it('never changes the dataset it plans from', async () => {
    const dataset = await buildDemoDataset(testContext());
    const before = structuredClone(dataset.rows.jobs);
    planSeed(dataset, everything(dataset), DONE);
    expect(dataset.rows.jobs).toEqual(before);
  });
});

describe('describePlan', () => {
  it('says what will be created and what will be replaced', async () => {
    const dataset = await buildDemoDataset(testContext());
    const lines = describePlan(planSeed(dataset, nothing(), { ...FRESH, careersPage: 'replace' }), { name: 'Officina', slug: 'officina' });
    expect(lines[0]).toBe('Demo seed for organization "Officina" (officina):');
    expect(lines).toContain('  job ads: 5 to create, 0 already there');
    expect(lines).toContain('  careers page: REPLACE the draft and the published page with the demo page');
    expect(lines).toContain('  privacy notice: create a demo notice (version 1)');
  });
});
