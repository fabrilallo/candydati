import { describe, expect, it } from 'vitest';
import { buildJob, buildJobTemplate, completeJobContent, fixedQualityReport } from '../testing/index.js';
import { toJobDto, toJobSummaryDto, toJobTemplateDto, toPublicJobDto, toPublicJobSummaryDto, toPublishJobResultDto } from './job-dto.js';

const published = buildJob({ status: 'published', publishedAt: new Date('2026-02-01T00:00:00.000Z'), quality: fixedQualityReport() });

describe('job mappers', () => {
  it('maps a complete job with ISO dates and no issues', () => {
    const dto = toJobDto(published);
    expect(dto).toMatchObject({ id: 'job_1', publishedAt: '2026-02-01T00:00:00.000Z', closedAt: null, publishIssues: [] });
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports publish issues for incomplete drafts', () => {
    const dto = toJobDto(buildJob({ content: completeJobContent({ title: 'x', process: [] }) }));
    expect(dto.publishIssues).toEqual([{ path: 'process', rule: 'too_few_stages' }]);
  });

  it('maps summaries', () => {
    expect(toJobSummaryDto(published, 6)).toMatchObject({ title: 'Backend Developer', role: 'backend_developer', publishable: true, publishIssueCount: 0, qualityTotal: 8, belowThreshold: false });
    expect(toJobSummaryDto(published, 9).belowThreshold).toBe(true);
    expect(toJobSummaryDto(published, 6).salary).toEqual(published.content.salary);
    const draft = toJobSummaryDto(buildJob({ content: completeJobContent({ title: 'x', process: [] }), quality: null }), 6);
    expect(draft).toMatchObject({ publishIssueCount: 1, belowThreshold: false });
    expect(draft.qualityTotal).toBeNull();
    expect(draft.publishedAt).toBeNull();
  });

  it('maps templates and publish results', () => {
    expect(toJobTemplateDto(buildJobTemplate()).updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(toPublishJobResultDto({ job: published, quality: null })).toMatchObject({ quality: null, job: { id: 'job_1' } });
  });

  it('maps public shapes without internal fields', () => {
    const dto = toPublicJobDto(published);
    expect(Object.keys(dto).sort()).toEqual(['content', 'publishedAt', 'slug']);
    const summary = toPublicJobSummaryDto(published);
    expect(summary).toMatchObject({ slug: published.slug, title: 'Backend Developer', role: 'backend_developer', stageCount: published.content.process.length, responseDays: published.content.responseDays });
    expect(JSON.stringify(summary)).not.toContain('org_test');
  });

  it('throws on corrupted or unpublished jobs', () => {
    const broken = buildJob({ status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'x', process: [] }) });
    expect(() => toPublicJobDto(broken)).toThrow();
    expect(() => toPublicJobSummaryDto(broken)).toThrow();
    expect(() => toPublicJobDto(buildJob())).toThrow(/published/);
  });
});
