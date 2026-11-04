import { clientInputSchema, SHORTLIST_REMINDER_DAYS, SHORTLIST_TOKEN_TTL_DAYS } from '@candydati/domain';
import { DEMO_TEMPLATES } from '../content/templates.js';
import { CLIENT, CLIENT_ANSWERS, NOTES_BY_STAGE, SHORTLIST_MESSAGE, TASKS } from '../content/texts.js';
import type { DemoContext, DemoRows } from '../dataset.js';
import { demoId } from '../ids.js';
import { daysAfter, daysBefore } from '../time.js';
import type { Applicant } from './applicants.js';
import { clientIdOf, templateIdOf } from './jobs.js';
import { shortlyAfter, type Timeline } from './timeline.js';

const current = (timeline: Timeline) => timeline.entries.at(-1) as Timeline['entries'][number];

const noteBody = (applicant: Applicant, restricted: boolean): string => {
  const pool = restricted ? NOTES_BY_STAGE.restricted : (NOTES_BY_STAGE[current(applicant.timeline).stageId] ?? NOTES_BY_STAGE.default);
  return (pool ?? [])[applicant.index % (pool ?? []).length] as string;
};

/** A note on every other application, written at its current stage; always one at a restricted stage. */
export function buildNotes(ctx: DemoContext, applicants: readonly Applicant[], restrictions: DemoRows['restrictions']): DemoRows['notes'] {
  const isRestricted = (applicant: Applicant): boolean =>
    restrictions.some((row) => row.jobId === applicant.jobId && row.stageId === current(applicant.timeline).stageId);
  return applicants
    .filter((applicant) => applicant.index % 2 === 0 || isRestricted(applicant))
    .map((applicant) => {
      const entry = current(applicant.timeline);
      return {
        id: demoId(ctx.organizationId, `note:${applicant.applicationId}`),
        organizationId: ctx.organizationId,
        candidateId: applicant.candidateId,
        applicationId: applicant.applicationId,
        stageId: entry.stageId,
        authorId: ctx.owner.id,
        body: noteBody(applicant, isRestricted(applicant)),
        createdAt: shortlyAfter(entry.at),
      };
    });
}

/** Follow-up tasks of the owner on open applications: some due, one late, one done. */
export function buildTasks(ctx: DemoContext, applicants: readonly Applicant[]): DemoRows['tasks'] {
  const open = applicants.filter((applicant) => applicant.timeline.outcome === null && applicant.spec.status === 'published');
  return TASKS.flatMap((task, index) => {
    const applicant = open[index * 3];
    if (applicant === undefined) return [];
    const createdAt = shortlyAfter(current(applicant.timeline).at);
    return [{
      id: demoId(ctx.organizationId, `task:${index}`),
      organizationId: ctx.organizationId,
      applicationId: applicant.applicationId,
      jobId: applicant.jobId,
      title: `${task.title} (${applicant.person.firstName} ${applicant.person.lastName})`.slice(0, 200),
      assigneeId: ctx.owner.id,
      dueAt: daysAfter(ctx.now, task.dueInDays),
      createdBy: ctx.owner.id,
      createdAt,
      completedAt: 'done' in task && task.done ? daysBefore(ctx.now, 0.5) : null,
    }];
  });
}

export function buildTemplates(ctx: DemoContext): DemoRows['templates'] {
  const at = daysBefore(ctx.now, 30);
  return DEMO_TEMPLATES.map((template) => ({ id: templateIdOf(ctx, template.key), organizationId: ctx.organizationId, ...template.input, kind: template.input.kind, createdAt: at, updatedAt: at }));
}

/** The agency's client, and a shortlist of three people sent to one of its contacts, two of them already answered. */
export function buildClient(ctx: DemoContext, applicants: readonly Applicant[], jobClients: DemoRows['jobClients']): Pick<DemoRows, 'clients' | 'shortlists' | 'shortlistItems'> {
  const parsed = clientInputSchema.parse({ name: CLIENT.name, website: CLIENT.website, contacts: CLIENT.contacts });
  const clientId = clientIdOf(ctx);
  const at = daysBefore(ctx.now, 25);
  const clients = [{ id: clientId, organizationId: ctx.organizationId, name: parsed.name, website: parsed.website, logoUrl: null, contacts: CLIENT.contacts.map((contact) => ({ ...contact })), createdBy: ctx.owner.id, createdAt: at, updatedAt: at }];
  const link = jobClients[0];
  const picked = applicants.filter((applicant) => applicant.jobId === link?.jobId && applicant.timeline.outcome === null && current(applicant.timeline).stageId === 'tecnico').slice(0, 3);
  if (link === undefined || picked.length === 0) return { clients, shortlists: [], shortlistItems: [] };
  const contact = CLIENT.contacts[0];
  const sentAt = daysBefore(ctx.now, 4);
  const shortlistId = demoId(ctx.organizationId, 'shortlist');
  const shortlists = [{
    id: shortlistId, organizationId: ctx.organizationId, jobId: link.jobId, clientId, recipientContactId: contact.id, recipientName: contact.name, recipientEmail: contact.email,
    tokenHash: ctx.secret(), message: SHORTLIST_MESSAGE, expiresAt: daysAfter(sentAt, SHORTLIST_TOKEN_TTL_DAYS), remindersSent: SHORTLIST_REMINDER_DAYS.length, firstOpenedAt: daysBefore(ctx.now, 3.5), createdBy: ctx.owner.id, createdAt: sentAt,
  }];
  const answers = [{ answer: 'meet' as const, answerReason: CLIENT_ANSWERS.meet }, { answer: 'not_for_us' as const, answerReason: CLIENT_ANSWERS.notForUs }];
  const shortlistItems = picked.map((applicant, position) => ({
    id: demoId(ctx.organizationId, `shortlist:${applicant.applicationId}`), organizationId: ctx.organizationId, shortlistId, applicationId: applicant.applicationId, position, shareCv: true, sharedNoteIds: [],
    answer: answers[position]?.answer ?? null, answerReason: answers[position]?.answerReason ?? null, answeredAt: answers[position] === undefined ? null : daysBefore(ctx.now, 3 - position),
  }));
  return { clients, shortlists, shortlistItems };
}
