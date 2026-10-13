import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { createTestJobDeps, fixedQualityReport, throwingAdQualityAnalyzer, userActor } from '../../testing/index.js';
import { analyzeJobAd } from './analyze-job-ad.js';

const actor = userActor({ role: 'hiring_manager', organizationId: 'org_a' });

describe('analyzeJobAd', () => {
  it('returns the assessment and the publish issues without audit or state change', async () => {
    const deps = createTestJobDeps();
    const result = await analyzeJobAd(deps, actor, { content: { title: 'Dev' } });
    expect(result.assessment).toEqual({ report: fixedQualityReport(), threshold: 6, belowThreshold: false });
    expect(result.publishIssues).toContainEqual({ path: 'role', rule: 'required' });
    expect(deps.auditLog.events()).toHaveLength(0);
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
