import { describe, expect, it } from 'vitest';
import { fragmentsOf } from './fragments.js';
import { isFiller } from './substance.js';
import { draft, richAd } from './testing/fixtures.js';

describe('isFiller', () => {
  it.each([
    'asd',
    'asdasd',
    'bla bla bla',
    'Blah blah',
    'xxx',
    'boh boh boh',
    'sdfghjkl qwerty',
    'asdfgh',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit 2024',
    'lalala lalala',
    'ciao ciao ciao ciao',
    'test',
    'Prova 2',
    'todo',
    'TBD',
    'asd asd asd 10 giorni',
    'cose varie',
    'pippo pluto paperino',
    '...',
    '123',
  ])('flags "%s" as filler', (text) => expect(isFiller(text, 'it')).toBe(true));

  it.each([
    'Almeno 3 anni di esperienza con Node.js e TypeScript',
    'Esperienza con Kubernetes',
    'Kubernetes',
    'Go',
    'C#',
    'HTML e CSS',
    'GDPR',
    'Scrivere test automatici con Vitest',
    'Inglese scritto livello B2',
    'Buoni pasto da 8 euro al giorno',
    '25 giorni di ferie',
    'Strengths in distributed systems',
    'Build and maintain the public API',
    'Feedback 1:1 ogni due settimane',
  ])('keeps "%s"', (text) => expect(isFiller(text, 'it')).toBe(false));

  it('needs two informative words in a prose field, one in a list item', () => {
    expect(isFiller('Mentoring', 'it', 'prose')).toBe(true);
    expect(isFiller('Mentoring', 'it', 'item')).toBe(false);
    expect(isFiller('Mentoring settimanale', 'it', 'prose')).toBe(false);
  });

  it('reads stop words of the language of the ad and of English', () => {
    expect(isFiller('il la di e', 'it')).toBe(true);
    expect(isFiller('the and of', 'en')).toBe(true);
    expect(isFiller('and the of il la', 'it')).toBe(true);
  });

  it('finds no filler in a rich, concrete ad', () => {
    const content = richAd();
    expect(fragmentsOf(content).filter((fragment) => isFiller(fragment.text, content.language))).toEqual([]);
  });

  it('finds no filler in an English ad written by a person', () => {
    const content = draft({
      language: 'en',
      summary: 'We build the payments platform used by 300 shops across Europe.',
      responsibilities: ['Own the checkout service end to end', 'Review pull requests within one working day'],
      requirements: { mustHave: ['Three years with Python', 'SQL'], niceToHave: [] },
      technologies: ['Python 3.13', 'Django', 'AWS'],
      culture: 'Weekly demos and written RFCs before large changes.',
    });
    expect(fragmentsOf(content).filter((fragment) => isFiller(fragment.text, content.language))).toEqual([]);
  });
});
