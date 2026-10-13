import { describe, expect, it } from 'vitest';
import { ITALIAN_PHRASES } from './phrases/index.js';
import { annotate, findHits, occursInAd, vaguePhrasesOf } from './detect.js';
import { draft } from './testing/fixtures.js';

describe('findHits', () => {
  it('finds Italian phrases ignoring case and accents and returns the original text', () => {
    const hits = findHits('Offriamo POSSIBILITA di crescita e una Retribuzione Competitiva.');
    expect(hits.map((hit) => hit.text)).toEqual(['POSSIBILITA di crescita', 'Retribuzione Competitiva']);
    expect(hits.map((hit) => hit.category)).toEqual(['growth', 'salary_transparency']);
  });
  it('keeps accents as written', () => {
    expect(findHits('Cerchiamo possibilità di crescita')[0]?.text).toBe('possibilità di crescita');
  });
  it('finds English phrases', () => {
    const hits = findHits('A fast-paced environment where you wear many hats. We are LIKE A FAMILY.');
    expect(hits.map((hit) => hit.text)).toEqual(['fast-paced environment', 'wear many hats', 'LIKE A FAMILY']);
  });
  it('handles typographic apostrophes', () => {
    expect(findHits('RAL commisurata all’esperienza')[0]?.text).toBe('RAL commisurata all’esperienza');
  });
  it('prefers the longest phrase and does not overlap', () => {
    const hits = findHits('massima flessibilità oraria');
    expect(hits).toHaveLength(1);
  });
  it('requires word boundaries', () => {
    expect(findHits('Cerchiamo un ninjaneer e un rockstars')).toHaveLength(0);
    expect(findHits('Ninja!')).toHaveLength(1);
  });
  it('returns nothing for concrete text', () => {
    expect(findHits('Budget annuo di 1.500 euro')).toHaveLength(0);
  });
});

describe('vaguePhrasesOf', () => {
  it('scans every free-text field and list item, once per phrase', () => {
    const content = draft({
      summary: 'Siamo come una famiglia.',
      benefits: ['ottimi benefit'],
      requirements: { mustHave: ['Resistenza allo stress', 'resistenza allo stress'], niceToHave: [] },
      process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter', note: 'ti ricontatteremo' }],
    });
    const phrases = vaguePhrasesOf(annotate(content), 'it');
    expect(phrases.map((phrase) => phrase.text)).toEqual(['come una famiglia', 'Resistenza allo stress', 'ottimi benefit', 'ti ricontatteremo']);
  });
  it('writes suggestions in the language of the ad, also for phrases of the other language', () => {
    const text = 'competitive salary e retribuzione competitiva';
    const en = vaguePhrasesOf(annotate(draft({ language: 'en', summary: text })), 'en');
    const it = vaguePhrasesOf(annotate(draft({ language: 'it', summary: text })), 'it');
    expect(en[0]?.suggestion).toMatch(/salary range/);
    expect(en[1]?.suggestion).toMatch(/salary range/);
    expect(it[0]?.suggestion).toMatch(/retribuzione lorda/);
    expect(it[1]?.suggestion).toMatch(/RAL/);
  });
  it('caps the list at 30', () => {
    const summary = ITALIAN_PHRASES.map((item) => item.phrase).join('. ').slice(0, 4000);
    const phrases = vaguePhrasesOf(annotate(draft({ summary })), 'it');
    expect(phrases).toHaveLength(30);
  });
});

describe('occursInAd', () => {
  it('checks literal occurrence', () => {
    const annotated = annotate(draft({ culture: 'Ambiente dinamico' }));
    expect(occursInAd('Ambiente dinamico', annotated)).toBe(true);
    expect(occursInAd('ambiente dinamico', annotated)).toBe(false);
    expect(occursInAd('', annotated)).toBe(false);
  });
});
