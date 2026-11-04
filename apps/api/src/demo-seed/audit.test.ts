import { newAuditEventSchema } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { testContext } from '../testing/demo-seed.js';
import { auditEventsFor } from './audit.js';
import { buildDemoDataset } from './build/dataset.js';
import { keysOf, ROW_TABLES } from './dataset.js';
import { planSeed, type ExistingKeys } from './plan.js';

const ctx = testContext();
const dataset = await buildDemoDataset(ctx);
const none = Object.fromEntries(ROW_TABLES.map((table) => [table, new Set<string>()])) as unknown as ExistingKeys;

describe('auditEventsFor', () => {
  it('records the seed as the system, marked as demo data, with valid product actions', () => {
    const events = auditEventsFor(planSeed(dataset, none, { privacyNotice: 'create', careersPage: 'replace', agency: 'enable' }), ctx.organizationId, 'notice_1');
    expect(events.length).toBeGreaterThan(50);
    for (const event of events) {
      const parsed = newAuditEventSchema.parse(event);
      expect(parsed.actor).toEqual({ type: 'system', id: null, onBehalfOfUserId: null });
      expect(parsed.metadata.demoSeed).toBe(true);
      expect(parsed.organizationId).toBe(ctx.organizationId);
    }
    const actions = new Set(events.map((event) => event.action));
    expect(actions).toEqual(new Set(['privacy_notice.published', 'organization.agency_setting_updated', 'job.created', 'job.published', 'job.closed', 'job.stage_restricted', 'job.scorecard_updated', 'job.interviewers_updated', 'email_template.saved', 'automation.saved', 'client.created', 'job.client_updated', 'shortlist.sent', 'application.received', 'feedback.submitted', 'careers_page.published']));
  });

  it('records nothing for a rerun that writes nothing', () => {
    const all = Object.fromEntries(ROW_TABLES.map((table) => [table, new Set(keysOf(dataset.rows, table))])) as unknown as ExistingKeys;
    expect(auditEventsFor(planSeed(dataset, all, { privacyNotice: 'keep', careersPage: 'unchanged', agency: 'unchanged' }), ctx.organizationId, 'notice_1')).toEqual([]);
  });
});
