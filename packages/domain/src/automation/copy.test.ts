import { describe, expect, it } from 'vitest';
import { copyAutomationsInputSchema, holderOf } from './copy.js';

const ok = (value: unknown) => copyAutomationsInputSchema.safeParse(value).success;

describe('copyAutomationsInputSchema', () => {
  it('copies some rules or every rule of a stage, between jobs and templates', () => {
    expect(ok({ from: { jobId: 'j1', ruleIds: ['r1'] }, to: { jobId: 'j1', stageId: 's2' } })).toBe(true);
    expect(ok({ from: { jobId: 'j1', stageId: 's1' }, to: { templateId: 't1', stageId: 's1' } })).toBe(true);
    expect(ok({ from: { templateId: 't1', stageId: 's1' }, to: { jobId: 'j2', stageId: 's1' } })).toBe(true);
  });

  it('needs exactly one holder on each side and exactly one source selection', () => {
    expect(ok({ from: { jobId: 'j1', templateId: 't1', stageId: 's1' }, to: { jobId: 'j1', stageId: 's2' } })).toBe(false);
    expect(ok({ from: { stageId: 's1' }, to: { jobId: 'j1', stageId: 's2' } })).toBe(false);
    expect(ok({ from: { jobId: 'j1', stageId: 's1', ruleIds: ['r1'] }, to: { jobId: 'j1', stageId: 's2' } })).toBe(false);
    expect(ok({ from: { jobId: 'j1' }, to: { jobId: 'j1', stageId: 's2' } })).toBe(false);
    expect(ok({ from: { jobId: 'j1', stageId: 's1' }, to: { stageId: 's2' } })).toBe(false);
    expect(ok({ from: { jobId: 'j1', stageId: 's1' }, to: { jobId: 'j1' } })).toBe(false);
  });

  it('caps the rules of one copy', () => {
    expect(ok({ from: { jobId: 'j1', ruleIds: Array.from({ length: 51 }, (_, i) => `r${i}`) }, to: { jobId: 'j1', stageId: 's2' } })).toBe(false);
  });
});

describe('holderOf', () => {
  it('names a job or a template', () => {
    expect(holderOf({ jobId: 'j1' })).toEqual({ kind: 'job', jobId: 'j1' });
    expect(holderOf({ templateId: 't1' })).toEqual({ kind: 'template', templateId: 't1' });
  });
});
