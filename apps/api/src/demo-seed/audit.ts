import type { AuditAction, NewAuditEvent } from '@candydati/domain';
import type { SeedPlan } from './plan.js';

/** Every event of the seed is the system's, marked as the demo's: the log tells seeded data from people's work. */
const METADATA = { demoSeed: true } as const;

/**
 * The audit trail of what the seed writes, with the actions the product uses for the same changes. Pure: one event per
 * created thing that people act on (ads, rules, templates, client, shortlist, applications, feedback), none for rows
 * that only record history.
 */
export function auditEventsFor(plan: SeedPlan, organizationId: string, noticeId: string): readonly NewAuditEvent[] {
  const event = (action: AuditAction, type: string, id: string, extra: Record<string, unknown> = {}): NewAuditEvent => ({
    organizationId,
    actor: { type: 'system', id: null },
    action,
    target: { type, id },
    metadata: { ...METADATA, ...extra },
  });
  const { rows, singletons } = plan;
  return [
    ...(singletons.privacyNotice === 'create' ? [event('privacy_notice.published', 'privacy_notice', noticeId, { version: 1 })] : []),
    ...(singletons.agency === 'enable' ? [event('organization.agency_setting_updated', 'organization', organizationId, { recruitsForClients: true })] : []),
    ...rows.jobs.flatMap((job) => [
      event('job.created', 'job', job.id, { title: job.title }),
      ...(job.publishedAt ? [event('job.published', 'job', job.id)] : []),
      ...(job.closedAt ? [event('job.closed', 'job', job.id)] : []),
    ]),
    ...rows.restrictions.map((row) => event('job.stage_restricted', 'job', row.jobId, { stageId: row.stageId })),
    ...[...new Set(rows.criteria.map((row) => row.jobId))].map((jobId) => event('job.scorecard_updated', 'job', jobId)),
    ...[...new Set(rows.interviewers.map((row) => row.jobId))].map((jobId) => event('job.interviewers_updated', 'job', jobId)),
    ...rows.templates.map((row) => event('email_template.saved', 'email_template', row.id, { kind: row.kind })),
    ...rows.automations.map((row) => event('automation.saved', 'automation_rule', row.id, { jobId: row.jobId, stageId: row.stageId })),
    ...rows.clients.map((row) => event('client.created', 'client', row.id)),
    ...rows.jobClients.map((row) => event('job.client_updated', 'job', row.jobId, { clientId: row.clientId })),
    ...rows.shortlists.map((row) => event('shortlist.sent', 'client_shortlist', row.id, { jobId: row.jobId })),
    ...rows.applications.map((row) => event('application.received', 'application', row.id, { jobId: row.jobId })),
    ...rows.feedbacks.map((row) => event('feedback.submitted', 'application', row.applicationId, { stageId: row.stageId })),
    ...(singletons.careersPage === 'unchanged' ? [] : [event('careers_page.published', 'careers_page', organizationId)]),
  ];
}
