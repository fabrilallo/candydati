import { describe, expect, it } from 'vitest';
import { SKILLS, skillEntryOf, skillKeys, skillProseTerms } from './dictionary.js';
import { normalizeSkill } from './normalize.js';

describe('normalizeSkill', () => {
  it('ignores case, spaces, punctuation and diacritics', () => {
    expect(normalizeSkill('Node.js')).toBe('nodejs');
    expect(normalizeSkill(' node js ')).toBe('nodejs');
    expect(normalizeSkill('NODE-JS')).toBe('nodejs');
    expect(normalizeSkill('Contabilità')).toBe('contabilita');
    expect(normalizeSkill('Zoë')).toBe('zoe');
  });

  it('keeps C, C++ and C# apart, and .NET readable', () => {
    expect(new Set([normalizeSkill('C'), normalizeSkill('C++'), normalizeSkill('C#')]).size).toBe(3);
    expect(normalizeSkill('.NET')).toBe('net');
  });

  it('keeps something for a text made only of symbols', () => {
    expect(normalizeSkill(' ?! ')).toBe('?!');
  });
});

describe('the dictionary', () => {
  it('is a solid list', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(150);
  });

  it('has unique, well-formed ids', () => {
    const ids = SKILLS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it('gives every written form to one skill only, with no redundant alias', () => {
    const owners = new Map<string, string>();
    const problems: string[] = [];
    for (const entry of SKILLS) {
      for (const form of [entry.name, ...entry.aliases]) {
        const key = normalizeSkill(form);
        const owner = owners.get(key);
        if (owner !== undefined) problems.push(`"${form}" (${entry.id}) collides with ${owner}`);
        owners.set(key, entry.id);
      }
    }
    expect(problems).toEqual([]);
  });

  it('lists as proseUnsafe only forms the entry really has', () => {
    for (const entry of SKILLS) {
      const keys = new Set([entry.name, ...entry.aliases].map(normalizeSkill));
      for (const form of entry.proseUnsafe ?? []) expect(keys.has(normalizeSkill(form)), `${entry.id}: ${form}`).toBe(true);
    }
  });
});

describe('skillKeys', () => {
  it('joins the spellings of one skill', () => {
    const go = skillKeys('Go');
    expect(go).toEqual(skillKeys('golang'));
    expect(go).toContain('go');
    expect(go).toContain('golang');
    expect(skillKeys('k8s')).toContain('kubernetes');
    expect(skillKeys('JS')).toContain('javascript');
    expect(skillKeys('Postgres')).toContain('postgresql');
    expect(skillKeys('Node')).toContain('nodejs');
    expect(skillKeys('csharp')).toContain('c#');
    expect(skillKeys('React.js')).toContain('react');
    expect(skillKeys('contabilita')).toContain('contabilita');
  });

  it('keeps C, C++ and C# separate', () => {
    expect(skillKeys('C')).not.toContain('c++');
    expect(skillKeys('C++')).not.toContain('c');
    expect(skillKeys('C#')).not.toContain('c++');
  });

  it('falls back to the normalized term for an unknown skill', () => {
    expect(skillKeys('Zig Lang Pro')).toEqual(['ziglangpro']);
  });
});

describe('skillProseTerms', () => {
  it('never searches an ordinary word as free text', () => {
    expect(skillProseTerms('Go')).toContain('golang');
    expect(skillProseTerms('Go')).not.toContain('Go');
    expect(skillProseTerms('R')).not.toContain('R');
    expect(skillProseTerms('Excel')).toContain('microsoft excel');
    expect(skillProseTerms('Excel')).not.toContain('Excel');
  });

  it('searches the written forms of a safe skill, and an unknown term as written', () => {
    expect(skillProseTerms('Kubernetes')).toEqual(expect.arrayContaining(['Kubernetes', 'k8s']));
    expect(skillProseTerms('C++')).toContain('C++');
    expect(skillProseTerms('Zig')).toEqual(['Zig']);
  });
});

describe('skillEntryOf', () => {
  it('finds a skill by any spelling', () => {
    expect(skillEntryOf('Golang')?.id).toBe('go');
    expect(skillEntryOf('.net')?.id).toBe('dotnet');
    expect(skillEntryOf('unknown thing')).toBeUndefined();
  });
});
