import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAutomationRule, buildJob, buildJobTemplate, buildPack, buildPackRule } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleAutomationPacks, createDrizzleJobTemplatePacks } from './drizzle-automation-packs.js';
import { createDrizzleAutomationRules } from './drizzle-automation-rules.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleJobTemplates } from './drizzle-job-templates.js';

let handle: DbHandle;

async function organization(): Promise<string> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  return org;
}

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});

afterAll(async () => {
  await handle.close();
});

describe('automation packs on Postgres', () => {
  it('stores packs and their rules, scoped to the organization, names unique ignoring case', async () => {
    const org = await organization();
    const repo = createDrizzleAutomationPacks(handle.db);
    const pack = await repo.create(buildPack({ id: randomUUID(), organizationId: org, name: 'Tech hiring' }));
    expect(await repo.findById(org, pack.id)).toEqual(pack);
    expect(await repo.findById(randomUUID(), pack.id)).toBeNull();
    expect((await repo.findByName(org, 'TECH HIRING'))?.id).toBe(pack.id);
    await expect(repo.create(buildPack({ id: randomUUID(), organizationId: org, name: 'tech hiring' }))).rejects.toThrow();
    const saved = await repo.save({ ...pack, name: 'Engineering', description: 'All tech', updatedAt: new Date('2026-11-02T00:00:00Z') });
    expect(saved).toMatchObject({ name: 'Engineering', description: 'All tech' });

    const move = await repo.createRule(buildPackRule({ id: randomUUID(), organizationId: org, packId: pack.id, stage: 'hr_interview', trigger: { type: 'stage_stuck', days: 4 }, action: { type: 'propose_move', toStageId: 'technical_interview' } }));
    const tag = await repo.createRule(buildPackRule({ id: randomUUID(), organizationId: org, packId: pack.id, stage: 'received', conditions: { tags: ['senior'] }, action: { type: 'add_tag', tag: 'new' }, createdAt: new Date('2026-11-03T00:00:00Z') }));
    expect(await repo.findRule(org, move.id)).toEqual(move);
    expect(await repo.listRules(org, pack.id)).toEqual([move, tag]);
    expect(await repo.countRules(org)).toEqual({ [pack.id]: 2 });
    const edited = await repo.saveRule({ ...tag, stage: 'offer', enabled: false });
    expect(edited).toMatchObject({ stage: 'offer', enabled: false, createdBy: tag.createdBy });
    expect(await repo.deleteRule(org, move.id)).toBe(true);
    expect(await repo.deleteRule(org, move.id)).toBe(false);
    expect((await repo.list(org)).map((p) => p.name)).toEqual(['Engineering']);
    expect(await repo.delete(org, pack.id)).toBe(true);
    expect(await repo.listRules(org, pack.id)).toEqual([]);
  });

  it('links packs to templates in order, and a deleted pack leaves the rules copied into jobs without a pack', async () => {
    const org = await organization();
    const packs = createDrizzleAutomationPacks(handle.db);
    const links = createDrizzleJobTemplatePacks(handle.db);
    const [a, b] = await Promise.all([
      packs.create(buildPack({ id: randomUUID(), organizationId: org, name: 'A' })),
      packs.create(buildPack({ id: randomUUID(), organizationId: org, name: 'B' })),
    ]);
    const template = await createDrizzleJobTemplates(handle.db).create(buildJobTemplate({ id: randomUUID(), organizationId: org }));
    await links.replace(org, template.id, [b!.id, a!.id]);
    expect(await links.listByTemplate(org, template.id)).toEqual([b!.id, a!.id]);
    expect(await links.templatesByPack(org)).toEqual({ [a!.id]: [template.id], [b!.id]: [template.id] });
    await links.replace(org, template.id, [a!.id]);
    expect(await links.listByTemplate(org, template.id)).toEqual([a!.id]);

    const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org });
    await createDrizzleJobs(handle.db).create(job);
    const rules = createDrizzleAutomationRules(handle.db);
    const packRule = await packs.createRule(buildPackRule({ id: randomUUID(), organizationId: org, packId: a!.id }));
    const copy = await rules.create(buildAutomationRule({ id: randomUUID(), organizationId: org, jobId: job.id, packId: a!.id, packRuleId: packRule.id }));
    expect(await rules.findById(org, copy.id)).toMatchObject({ packId: a!.id, packRuleId: packRule.id });
    await packs.delete(org, a!.id);
    expect(await links.listByTemplate(org, template.id)).toEqual([]);
    expect(await rules.findById(org, copy.id)).toMatchObject({ packId: null, packRuleId: null });
  });
});
