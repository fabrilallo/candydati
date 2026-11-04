import { cvExtractionSchema } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../random.js';
import { buildCv } from './cv.js';
import { CV_PROFILES } from './types.js';

const PERSON = { firstName: 'Elena', lastName: 'Greco', email: 'elena.greco@demo.example.com' };

describe('buildCv', () => {
  it.each(CV_PROFILES)('writes a valid extraction and a CV text for the %s profile', (profile) => {
    const cv = buildCv(PERSON, profile, 2026, seededRandom(9));
    expect(cvExtractionSchema.safeParse(cv.extraction).success).toBe(true);
    expect(cv.extraction.experiences).toHaveLength(2);
    expect(cv.lines[0]).toBe('Elena Greco');
    expect(cv.lines.join('\n')).toContain(cv.extraction.headline);
  });

  it('never carries data the CV reader must not keep (age, photo, nationality)', () => {
    const cv = buildCv(PERSON, 'backend', 2026, seededRandom(2));
    expect(Object.keys(cv.extraction).sort()).toEqual(['education', 'experiences', 'headline', 'languages', 'location', 'skills', 'yearsOfExperience']);
  });
});
