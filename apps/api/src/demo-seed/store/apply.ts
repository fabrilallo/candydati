import {
  createDrizzleAuditLog,
  createDrizzleCareersPages,
  createDrizzleOrganizationSettings,
  createDrizzlePrivacyNotices,
} from '@candydati/core';
import { schema, type Db } from '@candydati/db';
import type { CareersPageDocument, NewAuditEvent } from '@candydati/domain';
import { demoNoticeInput } from '../content/notice.js';
import { ROW_TABLES, type DemoContext, type DemoRows, type RowTable } from '../dataset.js';
import type { SeedPlan } from '../plan.js';
import { DemoSeedError, type DemoTarget } from './target.js';

const TABLES = {
  jobs: schema.job,
  jobTeam: schema.jobTeamMember,
  restrictions: schema.jobStageRestriction,
  criteria: schema.jobScorecardCriterion,
  interviewers: schema.jobStageInterviewer,
  templates: schema.emailTemplate,
  automations: schema.automationRule,
  clients: schema.client,
  jobClients: schema.jobClient,
  candidates: schema.candidate,
  applications: schema.application,
  extractions: schema.cvExtraction,
  stageEvents: schema.applicationStageEvent,
  promises: schema.responsePromise,
  notes: schema.candidateNote,
  feedbackRequests: schema.feedbackRequest,
  feedbacks: schema.interviewFeedback,
  shortlists: schema.clientShortlist,
  shortlistItems: schema.clientShortlistItem,
  tasks: schema.task,
} as const satisfies { readonly [T in RowTable]: unknown };

/** Rows go in by table, parents first. ON CONFLICT DO NOTHING is a second guard: the plan already left out what exists. */
async function insertRows(tx: Db, rows: DemoRows): Promise<void> {
  for (const table of ROW_TABLES) {
    const values = rows[table];
    if (values.length === 0) continue;
    // The union of tables defeats Drizzle's inference; each `rows[table]` is typed from that same table's `$inferInsert`.
    await tx.insert(TABLES[table] as typeof schema.job).values([...values] as never).onConflictDoNothing();
  }
}

async function writeSingletons(tx: Db, ctx: DemoContext, plan: SeedPlan, target: DemoTarget, careersPage: CareersPageDocument): Promise<void> {
  if (plan.singletons.privacyNotice === 'create') {
    await createDrizzlePrivacyNotices(tx).create({ ...demoNoticeInput(ctx.owner.email), id: ctx.notice.id, organizationId: ctx.organizationId, version: ctx.notice.version, createdBy: ctx.owner.id, createdAt: ctx.now });
  }
  if (plan.singletons.agency === 'enable') {
    await createDrizzleOrganizationSettings(tx).setAgency(ctx.organizationId, { recruitsForClients: true, agencyAuthorization: target.agencyAuthorization }, ctx.now);
  }
  if (plan.singletons.careersPage !== 'unchanged') {
    const published = await createDrizzleCareersPages(tx).publish(ctx.organizationId, careersPage, ctx.now, ctx.owner.id, target.careersRevision);
    if (published === null) throw new DemoSeedError('Someone saved the careers page while the seed was running. Nothing was written: run it again.');
  }
}

/** Everything in one transaction: the organization gets the whole demo or nothing. */
export async function applyPlan(db: Db, ctx: DemoContext, plan: SeedPlan, target: DemoTarget, careersPage: CareersPageDocument, events: readonly NewAuditEvent[]): Promise<void> {
  await db.transaction(async (tx) => {
    await writeSingletons(tx, ctx, plan, target, careersPage);
    await insertRows(tx, plan.rows);
    const audit = createDrizzleAuditLog(tx);
    for (const event of events) await audit.append(event);
  });
}
