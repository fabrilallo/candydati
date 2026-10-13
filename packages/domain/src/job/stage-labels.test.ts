import { describe, expect, it } from 'vitest';
import { STAGE_TYPES } from './taxonomy.js';
import { STAGE_TYPE_LABELS, stageDisplayName } from './stage-labels.js';

describe('stage labels', () => {
  it('labels every stage type in both languages', () => {
    for (const locale of ['it', 'en'] as const) for (const type of STAGE_TYPES) expect(STAGE_TYPE_LABELS[locale][type].length).toBeGreaterThan(0);
  });

  it('prefers the title the recruiter gave, otherwise the type in the language of the ad', () => {
    expect(stageDisplayName({ type: 'screening_call' }, 'it')).toBe('Chiamata conoscitiva');
    expect(stageDisplayName({ type: 'screening_call' }, 'en')).toBe('Screening call');
    expect(stageDisplayName({ type: 'team_interview', title: 'Incontro con il team' }, 'en')).toBe('Incontro con il team');
  });
});
