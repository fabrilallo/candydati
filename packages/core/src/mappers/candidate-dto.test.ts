import { describe, expect, it } from 'vitest';
import {
  buildApplication,
  buildAttachment,
  buildCandidate,
  buildExtraction,
  buildJob,
  buildNote,
  buildPrivacyNotice,
} from '../testing/index.js';
import { pipelineStagesOf } from '@candydati/domain';
import {
  toApplicationCardDto,
  toCandidateDetailDto,
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
    const view = { application, candidate, extraction: buildExtraction(), noteCount: 3, stageRemoved: false, responseState: 'closed' as const };
    expect(toApplicationCardDto(view)).toEqual({
      id: 'app_1',
      jobId: 'job_1',
      stageId: 'received',
      outcome: 'hired',
      createdAt: '2026-01-01T00:00:00.000Z',
      stageChangedAt: '2026-01-01T00:00:00.000Z',
      closedAt: '2026-03-01T00:00:00.000Z',
      responseDueAt: null,
      respondedAt: null,
      responseState: 'closed',
      noteCount: 3,
      consentStatus: 'given',
      importBatchId: null,
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
      stageRemoved: false,
      hasCv: true,
      candidate: { id: 'cand_1', firstName: 'Ada', lastName: 'Lovelace', tags: ['go'], headline: 'Senior engineer', location: 'Milano', yearsOfExperience: 8 },
    });
    expect(toApplicationCardDto({ ...view, extraction: null, application: buildApplication() })).toMatchObject({
      closedAt: null,
      candidate: { headline: null, location: null, yearsOfExperience: null },
    });
  });

  it('maps the pipeline', () => {
    const stages = pipelineStagesOf(job.content.process).map((stage, i) => ({ stage, count: i }));
    const dto = toPipelineDto({ job, stages, cards: [{ application, candidate, extraction: null, noteCount: 0, stageRemoved: false, responseState: 'on_track' as const }] });
    expect(dto.job).toEqual({ id: 'job_1', title: 'Backend Developer', status: 'published' });
    expect(dto.stages.map((s) => [s.id, s.count])).toEqual([['received', 0], ['stage-0', 1], ['stage-1', 2]]);
    expect(dto.stages[0]?.declared).toBeNull();
    expect(dto.applications).toHaveLength(1);
  });

  it('exposes stageRemoved on the card and on the candidate detail', () => {
    const view = { application: buildApplication({ stageId: 'gone' }), candidate, extraction: null, noteCount: 0, stageRemoved: true, responseState: 'on_track' as const };
    expect(toApplicationCardDto(view).stageRemoved).toBe(true);
    const stages = pipelineStagesOf(job.content.process);
    const detail = toCandidateDetailDto({
      candidate,
      applications: [
        { application: buildApplication({ stageId: 'gone' }), job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] },
        { application: buildApplication({ stageId: 'stage-0' }), job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] },
        { application: buildApplication({ stageId: 'received' }), job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] },
      ],
      notes: [],
    });
    expect(detail.applications.map((a) => a.stageRemoved)).toEqual([true, false, false]);
    expect(detail.applications.map((a) => a.messageCount)).toEqual([0, 0, 0]);
    const counted = toCandidateDetailDto({ candidate, applications: [{ application, job, stages, extraction: null, messageCount: 4, responseState: 'on_track' as const, attachments: [] }], notes: [] });
    expect(counted.applications[0]?.messageCount).toBe(4);
  });

  it('lists attachments without their storage key, and the form answers, empty when there are none', () => {
    const stages = pipelineStagesOf(job.content.process);
    const attachment = buildAttachment();
    const answered = buildApplication({ answers: [{ question: 'Q', answer: 'A' }] });
    const detail = toCandidateDetailDto({ candidate, applications: [{ application: answered, job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [attachment] }], notes: [] });
    expect(detail.applications[0]?.attachments).toEqual([{ id: 'att_1', kind: 'cover_letter', fileName: 'lettera.pdf', mediaType: 'application/pdf', sizeBytes: 64, createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(JSON.stringify(detail)).not.toContain(attachment.key);
    expect(detail.applications[0]?.answers).toEqual([{ question: 'Q', answer: 'A' }]);
    const bare = toCandidateDetailDto({ candidate, applications: [{ application, job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] }], notes: [] });
    expect(bare.applications[0]).toMatchObject({ attachments: [], answers: [] });
  });

  it('maps summaries', () => {
    const summary = { candidate, applicationCount: 2, lastAppliedAt: new Date('2026-02-01T00:00:00Z') };
    const one = (item: typeof summary) => toCandidateSummaryDtos({ items: [item], total: 1, page: 1, limit: 25 })[0];
    expect(one(summary)).toEqual({
      id: 'cand_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      tags: ['go'],
      talentPool: false,
      consentStatus: 'given',
      importBatchId: null,
      applicationCount: 2,
      lastAppliedAt: '2026-02-01T00:00:00.000Z',
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(one({ ...summary, lastAppliedAt: null })?.lastAppliedAt).toBeNull();
  });

  it('maps a note', () => {
    expect(toNoteDto({ note: buildNote({ applicationId: 'app_1' }), authorName: 'Rita' })).toEqual({
      id: 'note_1',
      applicationId: 'app_1',
      author: { id: 'user_test', name: 'Rita', external: false },
      body: 'Strong profile.',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('maps the detail: consent without notice id, CV without storage key, pending when there is no extraction', () => {
    const stages = pipelineStagesOf(job.content.process);
    const dto = toCandidateDetailDto({
      candidate,
      applications: [{ application, job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] }],
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
      consentStatus: 'given',
      importBatchId: null,
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const [app] = dto.applications;
    expect(app).toMatchObject({
      id: 'app_1',
      job: { id: 'job_1', title: 'Backend Developer', slug: 'backend-developer-abc123' },
      consent: { status: 'given', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: '2026-01-01T00:00:00.000Z' },
      cv: { fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 },
      extraction: { status: 'pending', data: null, source: null },
      stages: [{ id: 'received', declared: null }, { id: 'stage-0' }, { id: 'stage-1' }],
    });
    expect(JSON.stringify(dto)).not.toMatch(/notice_1|organizations\/|org_test/);
    expect(dto.notes).toHaveLength(1);
  });

  it('maps a migrated application without a CV: null CV on the detail, hasCv false on the card', () => {
    const migrated = buildApplication({ cv: null, migrationBatchId: 'mig_1' });
    const stages = pipelineStagesOf(job.content.process);
    const dto = toCandidateDetailDto({ candidate, applications: [{ application: migrated, job, stages, extraction: null, messageCount: 0, responseState: 'on_track' as const, attachments: [] }], notes: [] });
    expect(dto.applications[0]?.cv).toBeNull();
    const card = (app: typeof migrated) => toApplicationCardDto({ application: app, candidate, extraction: null, noteCount: 0, stageRemoved: false, responseState: 'on_track' as const });
    expect(card(migrated).hasCv).toBe(false);
    expect(card(application).hasCv).toBe(true);
  });

  it('maps a note by an external author: no id, the stored name, marked external', () => {
    const note = buildNote({ authorId: null, authorName: 'Giulia Rossi' });
    expect(toNoteDto({ note, authorName: 'Giulia Rossi' }).author).toEqual({ id: null, name: 'Giulia Rossi', external: true });
  });
});
