import { describe, expect, it } from 'vitest';
import { addSkillAliasInputSchema, builtInAliasKeys, builtInSkillAliasInputSchema, builtInSkillView, canonicalSkillName, checkNewSkillAlias } from './aliases.js';
import { DEFAULT_SKILL_BOOK, skillBookOf } from './dictionary.js';

describe('the alias input', () => {
  it('trims, and refuses empty, symbol-only and overlong text', () => {
    expect(addSkillAliasInputSchema.parse({ skill: ' Go ', alias: ' Go developer ' })).toEqual({ skill: 'Go', alias: 'Go developer' });
    for (const bad of ['', '   ', '?!', 'x'.repeat(61)]) expect(addSkillAliasInputSchema.safeParse({ skill: 'Go', alias: bad }).success, bad).toBe(false);
    expect(addSkillAliasInputSchema.safeParse({ skill: 'Go' }).success).toBe(false);
    expect(addSkillAliasInputSchema.safeParse({ skill: 'Go', alias: 'x', extra: 1 }).success).toBe(false);
  });

  it('refuses words that name a protected characteristic', () => {
    expect(addSkillAliasInputSchema.safeParse({ skill: 'Excel', alias: 'giovane' }).success).toBe(false);
    expect(builtInSkillAliasInputSchema.safeParse({ alias: 'married' }).success).toBe(false);
  });
});

describe('canonicalSkillName and checkNewSkillAlias', () => {
  it('names a known skill by its dictionary name and an unknown one as typed', () => {
    expect(canonicalSkillName(DEFAULT_SKILL_BOOK, 'golang')).toBe('Go');
    expect(canonicalSkillName(DEFAULT_SKILL_BOOK, 'Zorgbase')).toBe('Zorgbase');
  });

  it('accepts a free word, and refuses one the skill has, or another skill owns', () => {
    expect(checkNewSkillAlias(DEFAULT_SKILL_BOOK, 'Go', 'Go developer')).toBeNull();
    expect(checkNewSkillAlias(DEFAULT_SKILL_BOOK, 'Go', 'GOLANG')).toBe('alias_redundant');
    expect(checkNewSkillAlias(DEFAULT_SKILL_BOOK, 'Go', 'go')).toBe('alias_redundant');
    expect(checkNewSkillAlias(DEFAULT_SKILL_BOOK, 'Zorgbase', 'zorgbase')).toBe('alias_redundant');
    expect(checkNewSkillAlias(DEFAULT_SKILL_BOOK, 'Python', 'golang')).toBe('alias_taken');
    const book = skillBookOf({ aliases: [{ skill: 'Zorgbase', alias: 'Zorgy' }], disabled: [] });
    expect(checkNewSkillAlias(book, 'Sketch', 'zorgy')).toBe('alias_taken');
    expect(checkNewSkillAlias(book, 'zorgbase', 'ZORGY')).toBe('alias_redundant');
  });
});

describe('the built-in view', () => {
  it('lists the skills with aliases, each alias on unless switched off', () => {
    const view = builtInSkillView({ disabled: ['golang'] });
    expect(view.find((entry) => entry.id === 'go')).toEqual({ id: 'go', name: 'Go', aliases: [{ alias: 'golang', enabled: false }] });
    expect(view.every((entry) => entry.aliases.length > 0)).toBe(true);
    expect(builtInAliasKeys.has('golang')).toBe(true);
    expect(builtInAliasKeys.has('go')).toBe(false);
  });
});
