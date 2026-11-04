import { adQualityReportSchema, careersPageDocumentSchema, checkPublishable, cvExtractionSchema, FEEDBACK_REMINDER_DAYS, jobContentSchema, pipelineStagesOf, SHORTLIST_REMINDER_DAYS, storedObservationsSchema } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { testContext } from '../../testing/demo-seed.js';
import { ROW_TABLES } from '../dataset.js';
import { buildDemoDataset } from './dataset.js';

const ctx = testContext();
const dataset = await buildDemoDataset(ctx);
const { rows } = dataset;

describe('the demo dataset', () => {
  it('has five ads in every state, the published ones passing the publication rules', () => {
    expect(rows.jobs.map((job) => job.status).sort()).toEqual(['closed', 'draft', 'published', 'published', 'published']);
    for (const job of rows.jobs.filter((row) => row.status !== 'draft')) {
      const content = jobContentSchema.parse(job.content);
      expect(checkPublishable(content)).toEqual([]);
      expect(content.language).toBe('it');
      expect(content.salary.min).toBeGreaterThan(0);
      expect(job.publishedAt).not.toBeNull();
    }
    expect(rows.jobs.find((job) => job.status === 'closed')?.closedAt).not.toBeNull();
  });

  it('scores ads only: a precomputed model report on each published ad, none on the draft', () => {
    for (const job of rows.jobs) {
      if (job.status === 'draft') expect(job.quality).toBeNull();
      else expect(adQualityReportSchema.parse(job.quality).source).toBe('model');
    }
  });

  it('keeps every row inside the organization', () => {
    for (const table of ROW_TABLES) {
      for (const row of rows[table]) expect(row.organizationId).toBe(ctx.organizationId);
    }
  });

  it('has about forty invented candidates, each with one application and a CV in storage', () => {
    expect(rows.candidates).toHaveLength(40);
    expect(new Set(rows.candidates.map((row) => row.email.toLowerCase())).size).toBe(40);
    expect(rows.candidates.every((row) => row.email.endsWith('@demo.example.com'))).toBe(true);
    expect(rows.applications).toHaveLength(40);
    expect(new Set(dataset.cvFiles.map((file) => file.key))).toEqual(new Set(rows.applications.map((row) => row.cvKey)));
    for (const application of rows.applications) {
      const job = rows.jobs.find((row) => row.id === application.jobId);
      expect(pipelineStagesOf(jobContentSchema.parse(job?.content).process).map((stage) => stage.id)).toContain(application.stageId);
      expect(application.consent.privacyNoticeId).toBe(ctx.notice.id);
    }
  });

  it('records one hire with the offer accepted before the start', () => {
    const hires = rows.applications.filter((row) => row.outcome === 'hired');
    expect(hires).toHaveLength(1);
    expect(hires[0]?.offerAcceptedOn).toBeTruthy();
    expect((hires[0]?.startOn ?? '') >= (hires[0]?.offerAcceptedOn ?? '')).toBe(true);
    expect(rows.applications.filter((row) => row.outcome === null).every((row) => row.closedAt === null)).toBe(true);
  });

  it('stores the CV extraction as the model would have, with no data the reader must not keep', () => {
    expect(rows.extractions).toHaveLength(40);
    for (const extraction of rows.extractions) {
      expect(extraction.source).toBe('model');
      expect(cvExtractionSchema.safeParse(extraction.data).success).toBe(true);
    }
  });

  it('writes interview feedback in words: observations from the scorecard, no score anywhere', () => {
    expect(rows.feedbacks.length).toBeGreaterThan(3);
    for (const feedback of rows.feedbacks) {
      expect(storedObservationsSchema.safeParse(feedback.observations).success).toBe(true);
      expect(JSON.stringify(feedback)).not.toMatch(/"(score|rating|rank|weight)"/);
    }
    const used = rows.criteria.filter((criterion) => criterion.firstUsedAt);
    expect(used.length).toBeGreaterThan(0);
    expect(rows.feedbackRequests.some((request) => request.submittedAt === null)).toBe(true);
  });

  it('marks restricted stages and writes a note at one of them', () => {
    expect(rows.restrictions.length).toBeGreaterThanOrEqual(2);
    const restricted = new Set(rows.restrictions.map((row) => `${row.jobId}:${row.stageId}`));
    const application = (id: string | null | undefined) => rows.applications.find((row) => row.id === id);
    expect(rows.notes.some((note) => restricted.has(`${application(note.applicationId)?.jobId}:${note.stageId}`))).toBe(true);
  });

  it('links automations to demo templates and shortlists a client job', () => {
    const templateIds = new Set(rows.templates.map((row) => row.id));
    for (const rule of rows.automations.filter((row) => row.action === 'send_template')) expect(templateIds.has(String(rule.config.templateId))).toBe(true);
    expect(rows.templates.every((row) => row.kind === 'custom')).toBe(true);
    expect(rows.jobClients).toHaveLength(1);
    expect(rows.shortlistItems).toHaveLength(3);
    expect(rows.shortlistItems.filter((item) => item.answer !== null)).toHaveLength(2);
  });

  it('never lets the worker send reminders to demo interviewers or the demo client', () => {
    expect(rows.feedbackRequests.every((request) => request.remindersSent === FEEDBACK_REMINDER_DAYS.length)).toBe(true);
    expect(rows.shortlists.every((shortlist) => shortlist.remindersSent === SHORTLIST_REMINDER_DAYS.length)).toBe(true);
  });

  it('builds a valid careers page without uploaded media', () => {
    const page = careersPageDocumentSchema.parse(dataset.careersPage);
    expect(page.sections.map((section) => section.type)).toEqual(expect.arrayContaining(['hero', 'text', 'numbers', 'values', 'jobs']));
  });

  it('builds the same demo every time apart from link secrets', async () => {
    const again = await buildDemoDataset(testContext());
    expect(again.rows.applications).toEqual(rows.applications);
    expect(again.rows.feedbacks).toEqual(rows.feedbacks);
    expect(again.cvFiles).toEqual(dataset.cvFiles);
  });
});
