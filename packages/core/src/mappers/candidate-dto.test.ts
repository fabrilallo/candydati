import { describe, expect, it } from 'vitest';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildJob,
  buildNote,
  buildPrivacyNotice,
} from '../testing/index.js';
import { pipelineStagesOf } from '@tt/domain';
import {
  toApplicationCardDto,
  toCandidateDetailDto,
  toCandidateSummaryDto,
  toCandidateSummaryDtos,
  toNoteDto,
  toPipelineDto,
  toPrivacyNoticeDto,
  toPublicPrivacyNoticeDto,
} from './candidate-dto.js';

const job = buildJob({ id: 'job_1', status: 'published' });
const candidate = buildCandidate({ tags: ['go'], phone: '+39 02 1234567' });
const application = buildApplication({ closedAt: new Date('2026-03-01T00:00:00Z'), outcome: 'hired' });

describe('candidate DTO mappers', () => {
  it('maps a privacy notice with ISO dates, and the public one without ids', () => {
    const notice = buildPrivacyNotice();
    expect(toPrivacyNoticeDto(notice)).toEqual({
      id: 'notice_1',
      version: 1,
      language: 'it',
      text: notice.text,
      contactEmail: 'privacy@acme.example',
      retentionDays: { selection: 365, talent_pool: 730 },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(Object.keys(toPublicPrivacyNoticeDto(notice)).toSorted()).toEqual(['contactEmail', 'language', 'retentionDays', 'text', 'version']);
  });

  it('maps an application card with extraction highlights, or nulls', () => {
    const view = { application, candidate, extraction: buildExtraction(), noteCount: 3, stageRemoved: false };
    expect(toApplicationCardDto(view)).toEqual({
      id: 'app_1',
      jobId: 'job_1',
      stageId: 'received',
      outcome: 'hired',
      createdAt: '2026-01-01T00:00:00.000Z',
      stageChangedAt: '2026-01-01T00:00:00.000Z',
      closedAt: '2026-03-01T00:00:00.000Z',
      noteCount: 3,
      stageRemoved: false,
      candidate: { id: 'cand_1', firstName: 'Ada', lastName: 'Lovelace', tags: ['go'], headline: 'Senior engineer', location: 'Milano', yearsOfExperience: 8 },
    });
    expect(toApplicationCardDto({ ...view, extraction: null, application: buildApplication() })).toMatchObject({
      closedAt: null,
      candidate: { headline: null, location: null, yearsOfExperience: null },
    });
  });

  it('maps the pipeline', () => {
    const stages = pipelineStagesOf(job.content.process).map((stage, i) => ({ stage, count: i }));
    const dto = toPipelineDto({ job, stages, cards: [{ application, candidate, extraction: null, noteCount: 0, stageRemoved: false }] });
    expect(dto.job).toEqual({ id: 'job_1', title: 'Backend Developer', status: 'published' });
    expect(dto.stages.map((s) => [s.id, s.count])).toEqual([['received', 0], ['stage-0', 1], ['stage-1', 2]]);
    expect(dto.stages[0]?.declared).toBeNull();
    expect(dto.applications).toHaveLength(1);
  });

  it('exposes stageRemoved on the card and on the candidate detail', () => {
    const view = { application: buildApplication({ stageId: 'gone' }), candidate, extraction: null, noteCount: 0, stageRemoved: true };
    expect(toApplicationCardDto(view).stageRemoved).toBe(true);
    const stages = pipelineStagesOf(job.content.process);
    const detail = toCandidateDetailDto({
      candidate,
      applications: [
        { application: buildApplication({ stageId: 'gone' }), job, stages, extraction: null },
        { application: buildApplication({ stageId: 'stage-0' }), job, stages, extraction: null },
        { application: buildApplication({ stageId: 'received' }), job, stages, extraction: null },
      ],
      notes: [],
    });
    expect(detail.applications.map((a) => a.stageRemoved)).toEqual([true, false, false]);
  });

  it('maps summaries', () => {
    const summary = { candidate, applicationCount: 2, lastAppliedAt: new Date('2026-02-01T00:00:00Z') };
    expect(toCandidateSummaryDto(summary)).toEqual({
      id: 'cand_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      tags: ['go'],
      talentPool: false,
      applicationCount: 2,
      lastAppliedAt: '2026-02-01T00:00:00.000Z',
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(toCandidateSummaryDto({ ...summary, lastAppliedAt: null }).lastAppliedAt).toBeNull();
    expect(toCandidateSummaryDtos({ items: [summary], total: 1, page: 1, limit: 25 })).toHaveLength(1);
  });

  it('maps a note', () => {
    expect(toNoteDto({ note: buildNote({ applicationId: 'app_1' }), authorName: 'Rita' })).toEqual({
      id: 'note_1',
      applicationId: 'app_1',
      author: { id: 'user_test', name: 'Rita' },
      body: 'Strong profile.',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('maps the detail: consent without notice id, CV without storage key, pending when there is no extraction', () => {
    const stages = pipelineStagesOf(job.content.process);
    const dto = toCandidateDetailDto({
      candidate,
      applications: [{ application, job, stages, extraction: null }],
      notes: [{ note: buildNote(), authorName: 'Rita' }],
    });
    expect(dto.candidate).toEqual({
      id: 'cand_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+39 02 1234567',
      linkedinUrl: null,
      tags: ['go'],
      talentPool: false,
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const [app] = dto.applications;
    expect(app).toMatchObject({
      id: 'app_1',
      job: { id: 'job_1', title: 'Backend Developer', slug: 'backend-developer-abc123' },
      consent: { privacyNoticeVersion: 1, scopes: ['selection'], givenAt: '2026-01-01T00:00:00.000Z' },
      cv: { fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 },
      extraction: { status: 'pending', data: null, source: null },
      stages: [{ id: 'received', declared: null }, { id: 'stage-0' }, { id: 'stage-1' }],
    });
    expect(JSON.stringify(dto)).not.toMatch(/notice_1|organizations\/|org_test/);
    expect(dto.notes).toHaveLength(1);
  });
});
