import { describe, expect, it } from 'vitest';
import { DEFAULT_SKILL_BOOK, NO_SKILL_ALIASES, skillBookOf } from './dictionary.js';
import { normalizeSkill } from './normalize.js';

describe('skillBookOf', () => {
  it('is the built-in dictionary without changes', () => {
    expect(skillBookOf(NO_SKILL_ALIASES).keys('Go')).toEqual(DEFAULT_SKILL_BOOK.keys('Go'));
  });

  it('adds an alias to a built-in skill, both ways, in any spelling of the skill', () => {
    const book = skillBookOf({ aliases: [{ skill: 'Go', alias: 'Go Developer' }], disabled: [] });
    for (const term of ['Go', 'golang', 'go developer', 'GO-DEVELOPER']) expect(book.keys(term), term).toContain('godeveloper');
    expect(book.keys('Go developer')).toContain('golang');
    expect(DEFAULT_SKILL_BOOK.keys('Go')).not.toContain('godeveloper');
  });

  it('knows a brand-new skill with its aliases, and keeps the name implied', () => {
    const book = skillBookOf({ aliases: [{ skill: 'Zorgbase', alias: 'Zorg Hub' }, { skill: 'zorgbase', alias: 'Zorgy' }], disabled: [] });
    expect([...book.keys('zorgy')].sort()).toEqual(['zorgbase', 'zorghub', 'zorgy']);
    expect(book.entryOf('Zorgbase')?.id).toBe('own:zorgbase');
    expect(book.proseTerms('Zorgbase')).toEqual(expect.arrayContaining(['Zorgbase', 'Zorgy']));
  });

  it('switches a built-in alias off and leaves the skill name', () => {
    const book = skillBookOf({ aliases: [], disabled: [normalizeSkill('Golang')] });
    expect(book.keys('Go')).toEqual(['go']);
    expect(book.keys('golang')).toEqual(['golang']);
    expect(book.proseTerms('Go')).toEqual([]);
  });

  it('lets a disabled alias be written again for another skill', () => {
    const book = skillBookOf({ aliases: [{ skill: 'Gopher Tools', alias: 'golang' }], disabled: ['golang'] });
    expect(book.keys('Gopher Tools')).toContain('golang');
    expect(book.keys('Go')).not.toContain('golang');
  });

  it('ignores an alias the built-in dictionary already owns, so a word keeps one skill', () => {
    const book = skillBookOf({ aliases: [{ skill: 'Python', alias: 'golang' }], disabled: [] });
    expect(book.keys('Python')).not.toContain('golang');
    expect(book.keys('Go')).toContain('golang');
  });

  it('keeps C, C++ and C# apart whatever the organization adds', () => {
    const book = skillBookOf({ aliases: [{ skill: 'C#', alias: 'Sharp' }], disabled: [] });
    expect(book.keys('C#')).toEqual(expect.arrayContaining(['c#', 'csharp', 'sharp']));
    expect(book.keys('C')).not.toContain('c#');
  });
});
