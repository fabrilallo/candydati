import { describe, expect, it } from 'vitest';
import { seededRandom } from '../random.js';
import { DEMO_EMAIL_DOMAIN, emailOf, generatePeople } from './people.js';

describe('generatePeople', () => {
  it('builds distinct invented people with addresses on the reserved demo domain', () => {
    const people = generatePeople(40, seededRandom(42));
    expect(people).toHaveLength(40);
    expect(new Set(people.map((person) => person.email)).size).toBe(40);
    expect(new Set(people.map((person) => `${person.firstName} ${person.lastName}`)).size).toBe(40);
    expect(people.every((person) => person.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`))).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(generatePeople(5, seededRandom(1))).toEqual(generatePeople(5, seededRandom(1)));
  });

  it('refuses more people than it has names for', () => {
    expect(() => generatePeople(41, seededRandom(1))).toThrow(/At most 40/);
  });
});

describe('emailOf', () => {
  it('keeps ASCII letters and dots only', () => {
    expect(emailOf('Noemi', "D'Angelo")).toBe(`noemi.dangelo@${DEMO_EMAIL_DOMAIN}`);
    expect(emailOf('Niccolò', 'De Santis')).toBe(`niccolo.desantis@${DEMO_EMAIL_DOMAIN}`);
  });
});
