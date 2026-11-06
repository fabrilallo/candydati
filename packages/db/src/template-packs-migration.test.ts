import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { scratchDatabaseAt, type ScratchDatabase } from './testing/migrations-up-to.js';

const process = JSON.stringify({
  process: [
    { id: 'hr', type: 'hr_interview', durationMinutes: 30, conductedBy: 'recruiter' },
    { id: 'tech', type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
  ],
});

describe('job template rules become one automation pack per template', () => {
  let db: ScratchDatabase;
  let client: pg.Client;

  beforeAll(async () => {
    db = await scratchDatabaseAt(`candydati_template_packs_${globalThis.process.pid}_test`, '0052_automation_packs');
    client = db.client;
    await client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org_1', 'Org', 'org-1', now()), ('org_2', 'Org 2', 'org-2', now())`);
    await client.query(`INSERT INTO automation_pack (id, organization_id, name, created_by) VALUES ('mine', 'org_1', 'Backend (template)', 'u1')`);
    await client.query(
      `INSERT INTO job_template (id, organization_id, name, content, created_by) VALUES
        ('t1', 'org_1', 'Backend', $1, 'u1'), ('t2', 'org_1', 'Backend', $1, 'u1'), ('t3', 'org_2', 'Empty', $1, 'u2')`,
      [process],
    );
    await client.query(`INSERT INTO job_template_automation (id, organization_id, template_id, stage_id, trigger, trigger_config, conditions, action, config, enabled, created_by, created_at) VALUES
      ('r1', 'org_1', 't1', 'received', 'stage_entered', '{}', '{}', 'add_tag', '{"tag":"new"}', true, 'u1', now() - interval '2 days'),
      ('r2', 'org_1', 't1', 'tech', 'stage_stuck', '{"days":5}', '{"tags":["senior"]}', 'request_feedback', '{}', false, 'u1', now() - interval '1 day'),
      ('r3', 'org_1', 't1', 'hr', 'stage_entered', '{}', '{}', 'propose_move', '{"toStageId":"tech"}', true, 'u1', now()),
      ('r4', 'org_1', 't1', 'gone', 'stage_entered', '{}', '{}', 'add_tag', '{"tag":"x"}', true, 'u1', now()),
      ('r5', 'org_1', 't1', 'tech', 'stage_entered', '{}', '{}', 'propose_move', '{"toStageId":"received"}', true, 'u1', now()),
      ('r6', 'org_1', 't2', 'received', 'stage_entered', '{}', '{}', 'add_tag', '{"tag":"two"}', true, 'u1', now())`);
    await runMigrations(db.url);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('creates a pack per template that had rules, named after it without clashing, and links it to the template', async () => {
    const { rows } = await client.query<{ name: string; template_id: string; organization_id: string }>(
      `SELECT p.name, l.template_id, p.organization_id FROM automation_pack p JOIN job_template_pack l ON l.pack_id = p.id ORDER BY l.template_id`,
    );
    expect(rows).toEqual([
      { name: 'Backend (template 2)', template_id: 't1', organization_id: 'org_1' },
      { name: 'Backend (template 3)', template_id: 't2', organization_id: 'org_1' },
    ]);
  });

  it('turns stage ids into stage types, keeps trigger, conditions, action and switch, and drops what cannot be placed', async () => {
    const { rows } = await client.query<{ stage_anchor: string; trigger: string; trigger_config: unknown; conditions: unknown; action: string; config: unknown; enabled: boolean }>(
      `SELECT r.stage_anchor, r.trigger, r.trigger_config, r.conditions, r.action, r.config, r.enabled FROM automation_pack_rule r
        JOIN job_template_pack l ON l.pack_id = r.pack_id WHERE l.template_id = 't1' ORDER BY r.created_at`,
    );
    expect(rows).toEqual([
      { stage_anchor: 'received', trigger: 'stage_entered', trigger_config: {}, conditions: {}, action: 'add_tag', config: { tag: 'new' }, enabled: true },
      { stage_anchor: 'technical_interview', trigger: 'stage_stuck', trigger_config: { days: 5 }, conditions: { tags: ['senior'] }, action: 'request_feedback', config: {}, enabled: false },
      { stage_anchor: 'hr_interview', trigger: 'stage_entered', trigger_config: {}, conditions: {}, action: 'propose_move', config: { toStageId: 'technical_interview' }, enabled: true },
    ]);
  });

  it('removes the table of template rules', async () => {
    const { rows } = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'job_template_automation'`);
    expect(rows).toEqual([]);
  });
});
