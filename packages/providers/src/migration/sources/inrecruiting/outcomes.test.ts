import { describe, expect, it } from 'vitest';
import { outcomeOf } from './outcomes.js';

describe('outcomeOf', () => {
  it.each([
    ['Assunto', 'hired'],
    ['Assunta', 'hired'],
    ['HIRED', 'hired'],
    ['Offerta accettata', 'hired'],
    ['Scartato', 'not_selected'],
    ['Rifiutato', 'not_selected'],
    ['Non idoneo', 'not_selected'],
    ['Non idonea', 'not_selected'],
    ['Non assunto', 'not_selected'],
    ['Rejected', 'not_selected'],
    ['Ritirato', 'withdrawn'],
    ['Withdrawn', 'withdrawn'],
    ['Offerta rifiutata', 'withdrawn'],
    ['Rinuncia del candidato', 'withdrawn'],
  ])('%s is %s', (text, outcome) => expect(outcomeOf(text)).toBe(outcome));

  it.each(['', 'Colloquio HR', 'In corso', 'Offerta', 'Screening'])('%j is only a stage', (text) => expect(outcomeOf(text)).toBeNull());
});
