import { describe, expect, it } from 'vitest';
import { NO_SKILL_ALIASES } from './book.js';
import { skillBookOf } from './dictionary.js';
import { groupExtractedSkills } from './group.js';

const book = skillBookOf(NO_SKILL_ALIASES);

describe('groupExtractedSkills', () => {
  it('names the canonical skill and keeps what the CV says', () => {
    expect(groupExtractedSkills(book, ['Golang'])).toEqual([{ canonical: 'Go', writtenAs: ['Golang'] }]);
  });

  it('merges the written forms of one skill, in order of first appearance', () => {
    expect(groupExtractedSkills(book, ['TypeScript', 'Go', 'Golang', 'Docker'])).toEqual([
      { canonical: 'TypeScript', writtenAs: ['TypeScript'] },
      { canonical: 'Go', writtenAs: ['Go', 'Golang'] },
      { canonical: 'Docker', writtenAs: ['Docker'] },
    ]);
  });

  it('has no canonical for an unknown skill, and merges only spellings of the same key', () => {
    expect(groupExtractedSkills(book, ['Zorgbase', 'zorg-base', 'Other'])).toEqual([
      { canonical: null, writtenAs: ['Zorgbase', 'zorg-base'] },
      { canonical: null, writtenAs: ['Other'] },
    ]);
  });

  it('uses the aliases of the organization and does not repeat an identical form', () => {
    const own = skillBookOf({ aliases: [{ skill: 'Go', alias: 'Gopher' }], disabled: [] });
    expect(groupExtractedSkills(own, ['Gopher', 'Go', 'Gopher'])).toEqual([{ canonical: 'Go', writtenAs: ['Gopher', 'Go'] }]);
  });

  it('does not change its input', () => {
    const input = Object.freeze(['Go', 'Golang']);
    expect(groupExtractedSkills(book, input)).toHaveLength(1);
  });
});
