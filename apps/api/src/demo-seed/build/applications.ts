import { computeResponseDueAt, retentionExpiry, statusWhenAnswered, type ConsentRecord, type ConsentScope } from '@candydati/domain';
import { buildCv } from '../content/cv.js';
import type { CvFile, DemoContext, DemoRows } from '../dataset.js';
import { demoId } from '../ids.js';
import { textPdf } from '../pdf.js';
import { seededRandom } from '../random.js';
import { isoDay, daysAfter, daysBefore } from '../time.js';
import { demoJobContent } from './jobs.js';
import { leftAt, type Timeline } from './timeline.js';
import type { Applicant } from './applicants.js';

const ORIGINS = ['linkedin', 'direct', 'google.com', 'indeed.com', 'linkedin', 'direct'] as const;

type ApplicationRows = Pick<DemoRows, 'candidates' | 'applications' | 'extractions' | 'stageEvents' | 'promises'>;

const lastEntry = (timeline: Timeline) => timeline.entries.at(-1) as Timeline['entries'][number];
const appliedAt = (timeline: Timeline): Date => (timeline.entries[0] as Timeline['entries'][number]).at;

const consentOf = (ctx: DemoContext, applicant: Applicant): ConsentRecord => {
  const scopes: ConsentScope[] = applicant.index % 3 === 0 ? ['selection', 'talent_pool'] : ['selection'];
  return { privacyNoticeId: ctx.notice.id, privacyNoticeVersion: ctx.notice.version, scopes, givenAt: appliedAt(applicant.timeline) };
};

const hireDates = (ctx: DemoContext, applicant: Applicant) => {
  const hire = applicant.spec.hire;
  if (applicant.timeline.outcome !== 'hired' || hire === undefined) return { offerAcceptedOn: null, startOn: null };
  return { offerAcceptedOn: isoDay(daysBefore(ctx.now, hire.offerAcceptedDaysAgo)), startOn: isoDay(daysAfter(ctx.now, hire.startsInDays)) };
};

const applicationRow = (ctx: DemoContext, applicant: Applicant, file: CvFile): DemoRows['applications'][number] => {
  const { timeline, person } = applicant;
  const consent = consentOf(ctx, applicant);
  const current = lastEntry(timeline);
  const open = timeline.outcome === null;
  return {
    id: applicant.applicationId,
    organizationId: ctx.organizationId,
    jobId: applicant.jobId,
    candidateId: applicant.candidateId,
    stageId: current.stageId,
    outcome: timeline.outcome,
    message: applicant.index % 4 === 0 ? 'Mi interessa molto il modo in cui descrivete il processo di selezione. Resto a disposizione per una chiamata.' : '',
    cvKey: file.key,
    cvFileName: `CV ${person.firstName} ${person.lastName}.pdf`,
    cvMediaType: 'application/pdf',
    cvSizeBytes: file.bytes.byteLength,
    submittedContact: { firstName: person.firstName, lastName: person.lastName, phone: null, linkedinUrl: null },
    consent,
    consentStatus: 'given',
    retentionExpiresAt: retentionExpiry(consent, ctx.notice),
    source: 'careers_page',
    origin: ORIGINS[applicant.index % ORIGINS.length] as string,
    createdAt: appliedAt(timeline),
    updatedAt: timeline.decidedAt ?? current.at,
    stageChangedAt: current.at,
    closedAt: timeline.decidedAt,
    ...hireDates(ctx, applicant),
    responseDueAt: open ? computeResponseDueAt(current.at, { content: demoJobContent(applicant.spec) }) : null,
    respondedAt: null,
  };
};

const candidateRow = (ctx: DemoContext, applicant: Applicant, skills: readonly string[]): DemoRows['candidates'][number] => {
  const consent = consentOf(ctx, applicant);
  return {
    id: applicant.candidateId,
    organizationId: ctx.organizationId,
    firstName: applicant.person.firstName,
    lastName: applicant.person.lastName,
    email: applicant.person.email,
    tags: applicant.index % 3 === 1 ? skills.slice(0, 2) : [],
    talentPool: consent.scopes.includes('talent_pool'),
    retentionExpiresAt: retentionExpiry(consent, ctx.notice),
    createdAt: appliedAt(applicant.timeline),
    updatedAt: appliedAt(applicant.timeline),
  };
};

const trackingRows = (ctx: DemoContext, applicant: Applicant): Pick<ApplicationRows, 'stageEvents' | 'promises'> => {
  const { timeline, applicationId, jobId } = applicant;
  const organizationId = ctx.organizationId;
  const key = (suffix: string): string => demoId(organizationId, `application:${applicationId}:${suffix}`);
  const days = applicant.spec.content.responseDays;
  const moves = timeline.entries.map((entry, position) => ({
    id: key(`event:${position}`),
    organizationId,
    applicationId,
    jobId,
    fromStageId: position === 0 ? null : (timeline.entries[position - 1]?.stageId ?? null),
    toStageId: entry.stageId,
    outcome: null,
    occurredAt: entry.at,
    actorType: position === 0 ? ('system' as const) : ('user' as const),
  }));
  const decision = timeline.decidedAt === null || timeline.outcome === null ? [] : [
    { id: key('event:decision'), organizationId, applicationId, jobId, fromStageId: lastEntry(timeline).stageId, toStageId: null, outcome: timeline.outcome, occurredAt: timeline.decidedAt, actorType: 'user' as const },
  ];
  const promises = days === undefined ? [] : timeline.entries.map((entry, position) => {
    const dueAt = daysAfter(entry.at, days);
    const respondedAt = leftAt(timeline, position);
    return { id: key(`promise:${position}`), organizationId, applicationId, jobId, stageId: entry.stageId, startedAt: entry.at, dueAt, respondedAt, status: respondedAt === null ? ('open' as const) : statusWhenAnswered(dueAt, respondedAt) };
  });
  return { stageEvents: [...moves, ...decision], promises };
};

/** Candidates, their applications with a CV each, the precomputed CV extraction, stage history and response promises. */
export function buildApplications(ctx: DemoContext, applicants: readonly Applicant[]): ApplicationRows & { readonly cvFiles: readonly CvFile[] } {
  const year = ctx.now.getUTCFullYear();
  const built = applicants.map((applicant) => {
    const cv = buildCv(applicant.person, applicant.spec.profile, year, seededRandom(1_000 + applicant.index));
    const file: CvFile = { applicationId: applicant.applicationId, key: `organizations/${ctx.organizationId}/applications/${applicant.applicationId}/cv`, bytes: textPdf(cv.lines) };
    const extraction = { applicationId: applicant.applicationId, organizationId: ctx.organizationId, status: 'done' as const, text: cv.lines.join('\n'), data: cv.extraction, source: 'model' as const, updatedAt: appliedAt(applicant.timeline) };
    return { file, extraction, candidate: candidateRow(ctx, applicant, cv.extraction.skills), application: applicationRow(ctx, applicant, file), tracking: trackingRows(ctx, applicant) };
  });
  return {
    candidates: built.map((item) => item.candidate),
    applications: built.map((item) => item.application),
    extractions: built.map((item) => item.extraction),
    stageEvents: built.flatMap((item) => item.tracking.stageEvents),
    promises: built.flatMap((item) => item.tracking.promises),
    cvFiles: built.map((item) => item.file),
  };
}
