import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { completeJobContent, createTestJobDeps, fixedQualityReport, throwingAdQualityAnalyzer, unavailableAdQualityAnalyzer, userActor } from '../../testing/index.js';
import { analyzeJobAd } from './analyze-job-ad.js';

const actor = userActor({ role: 'hiring_manager', organizationId: 'org_a' });

describe('analyzeJobAd', () => {
  it('returns the assessment and the publish issues without audit or state change', async () => {
    const deps = createTestJobDeps();
    const result = await analyzeJobAd(deps, actor, { content: { title: 'Dev' } });
    expect(result.status).toBe('assessed');
    expect(result.assessment).toEqual({ report: fixedQualityReport(), threshold: 6, belowThreshold: false });
    expect(result.publishIssues).toContainEqual({ path: 'role', rule: 'required' });
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('has no score without a model, and still checks the publication and compliance rules', async () => {
    const deps = createTestJobDeps({ adQuality: unavailableAdQualityAnalyzer() });
    const content = completeJobContent({ title: 'Sviluppatore backend', requirements: { mustHave: ['Massimo 30 anni'], niceToHave: [] } });
    const result = await analyzeJobAd(deps, actor, { content });
    expect(result).toMatchObject({ status: 'unavailable', assessment: null });
    expect(result.publishIssues.length).toBeGreaterThan(0);
    expect((await analyzeJobAd(deps, actor, { content: { title: 'Dev' } })).publishIssues).toContainEqual({ path: 'role', rule: 'required' });
  });

  it('lets analyzer failures propagate', async () => {
    const deps = createTestJobDeps({ adQuality: throwingAdQualityAnalyzer(new Error('down')) });
    await expect(analyzeJobAd(deps, actor, { content: { title: 'Dev' } })).rejects.toThrow('down');
  });

  it('validates content and denies interviewers', async () => {
    await expect(analyzeJobAd(createTestJobDeps(), actor, { content: {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      analyzeJobAd(createTestJobDeps(), userActor({ role: 'interviewer', organizationId: 'org_a' }), { content: { title: 'x' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
