import { describe, expect, it } from 'vitest';
import { buildJob, buildJobTemplate, completeJobContent, fixedQualityReport } from '../testing/index.js';
import { toJobDto, toJobSummaryDto, toJobTemplateDto, toPublicJobDto, toPublicJobSummaryDto, toPublicOrganizationDto, toPublishJobResultDto } from './job-dto.js';

/** A model configured (or not) and the instance threshold, as the mappers read them from `JobDeps`. */
const scoring = (threshold = 6, available = true) => ({ adQuality: { available: () => available }, adQualityThreshold: threshold });
const published = buildJob({ status: 'published', publishedAt: new Date('2026-02-01T00:00:00.000Z'), quality: fixedQualityReport() });

describe('job mappers', () => {
  it('maps a complete job with ISO dates and no issues', () => {
    const dto = toJobDto(published, scoring());
    expect(dto).toMatchObject({ id: 'job_1', publishedAt: '2026-02-01T00:00:00.000Z', closedAt: null, publishIssues: [] });
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports publish issues for incomplete drafts', () => {
    const dto = toJobDto(buildJob({ content: completeJobContent({ title: 'x', process: [] }) }), scoring());
    expect(dto.publishIssues).toEqual([{ path: 'process', rule: 'too_few_stages' }]);
  });

  it('maps summaries', () => {
    expect(toJobSummaryDto(published, scoring())).toMatchObject({ title: 'Backend Developer', role: 'backend_developer', publishable: true, publishIssueCount: 0, qualityTotal: 8, belowThreshold: false });
    expect(toJobSummaryDto(published, scoring(9)).belowThreshold).toBe(true);
    expect(toJobSummaryDto(published, scoring()).salary).toEqual(published.content.salary);
    const draft = toJobSummaryDto(buildJob({ content: completeJobContent({ title: 'x', process: [] }), quality: null }), scoring());
    expect(draft).toMatchObject({ publishIssueCount: 1, belowThreshold: false });
    expect(draft.qualityTotal).toBeNull();
    expect(draft.publishedAt).toBeNull();
  });

  it('shows a stored score only when a model produced it and a model is configured now', () => {
    expect(toJobDto(published, scoring()).quality).toEqual(fixedQualityReport());
    expect(toJobDto(published, scoring(6, false)).quality).toBeNull();
    expect(toJobSummaryDto(published, scoring(9, false))).toMatchObject({ qualityTotal: null, belowThreshold: false });
    const byRules = buildJob({ ...published, quality: fixedQualityReport(2, 'rules') });
    expect(toJobDto(byRules, scoring()).quality).toBeNull();
    expect(toJobSummaryDto(byRules, scoring())).toMatchObject({ qualityTotal: null, belowThreshold: false });
  });

  it('carries a custom role text in summaries, and only for the other role', () => {
    const custom = buildJob({ status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'Pastry chef', role: 'other', customRole: 'Pastry chef' }) });
    expect(toJobSummaryDto(custom, scoring())).toMatchObject({ role: 'other', customRole: 'Pastry chef' });
    expect(toPublicJobSummaryDto(custom)).toMatchObject({ role: 'other', customRole: 'Pastry chef' });
    expect(toJobSummaryDto(published, scoring()).customRole).toBeNull();
    expect(toPublicJobSummaryDto(published)).not.toHaveProperty('customRole');
  });

  it('maps templates and publish results', () => {
    expect(toJobTemplateDto(buildJobTemplate()).updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(toPublishJobResultDto({ job: published, quality: null, qualityStatus: 'unavailable' }, scoring())).toMatchObject({ quality: null, qualityStatus: 'unavailable', job: { id: 'job_1' } });
  });

  it('maps public shapes without internal fields', () => {
    const dto = toPublicJobDto(published);
    expect(Object.keys(dto).sort()).toEqual(['content', 'publishedAt', 'slug', 'updatedAt']);
    const summary = toPublicJobSummaryDto(published);
    expect(summary).toMatchObject({ slug: published.slug, title: 'Backend Developer', role: 'backend_developer', stageCount: published.content.process.length, responseDays: published.content.responseDays, updatedAt: published.updatedAt.toISOString() });
    expect(JSON.stringify(summary)).not.toContain('org_test');
  });

  it('throws on corrupted or unpublished jobs', () => {
    const broken = buildJob({ status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'x', process: [] }) });
    expect(() => toPublicJobDto(broken)).toThrow();
    expect(() => toPublicJobSummaryDto(broken)).toThrow();
    expect(() => toPublicJobDto(buildJob())).toThrow(/published/);
  });
});

describe('toPublicOrganizationDto logo', () => {
  it('only exposes an https logo', () => {
    const org = { id: 'o', name: 'Acme', slug: 'acme' };
    expect(toPublicOrganizationDto({ ...org, logo: 'javascript:alert(1)' }).logo).toBeNull();
    expect(toPublicOrganizationDto({ ...org, logo: 'http://a.example/l.png' }).logo).toBeNull();
    expect(toPublicOrganizationDto({ ...org, logo: 'https://a.example/l.png' }).logo).toBe('https://a.example/l.png');
  });

  it('prefers the library image, served from the public media route under the slug', () => {
    const org = { id: 'o', name: 'Acme', slug: 'acme', logo: 'https://a.example/l.png' };
    const logoFile = { mediaId: 'm1', fileName: 'abc-640.webp' };
    expect(toPublicOrganizationDto({ ...org, logoFile }).logo).toBe('/api/v1/public/organizations/acme/careers-media/m1/abc-640.webp');
    expect(toPublicOrganizationDto({ ...org, logoFile: null }).logo).toBe('https://a.example/l.png');
  });
});
