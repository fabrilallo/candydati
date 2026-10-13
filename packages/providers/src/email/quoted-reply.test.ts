import { describe, expect, it } from 'vitest';
import { stripQuotedReply } from './quoted-reply.js';

const NEW = 'Grazie, confermo la disponibilità per giovedì.';

const cases: ReadonlyArray<readonly [string, string]> = [
  ['gmail en', `${NEW}\n\nOn Tue, 3 Mar 2026 at 10:15, HR Team <hr@example.com> wrote:\n> Can you confirm?\n> Thanks`],
  ['gmail en wrapped', `${NEW}\n\nOn Tue, 3 Mar 2026 at 10:15, A Very Long Name\n<hr@example.com> wrote:\n> Can you confirm?`],
  ['gmail it', `${NEW}\n\nIl giorno mar 3 mar 2026 alle ore 10:15 HR Team <hr@example.com> ha scritto:\n> Puoi confermare?`],
  ['it short', `${NEW}\n\nIl 03/03/2026 10:15, HR Team ha scritto:\n> Puoi confermare?`],
  ['apple mail', `${NEW}\n\nOn 3 Mar 2026, at 10:15, HR Team <hr@example.com> wrote:\n\nCan you confirm?`],
  ['outlook en original', `${NEW}\n\n-----Original Message-----\nFrom: HR <hr@example.com>\nSent: Tuesday\nSubject: Hi\n\nCan you confirm?`],
  ['outlook it original', `${NEW}\n\n-----Messaggio originale-----\nDa: HR\nInviato: martedì\n\nPuoi confermare?`],
  ['outlook header block en', `${NEW}\n\nFrom: HR <hr@example.com>\nSent: Tuesday, March 3, 2026 10:15 AM\nTo: Me\nSubject: Hi\n\nCan you confirm?`],
  ['outlook header block it', `${NEW}\n\nDa: HR <hr@example.com>\nInviato: martedì 3 marzo 2026 10:15\nA: Me\nOggetto: Ciao\n\nPuoi confermare?`],
  ['outlook underscore rule', `${NEW}\n\n________________________________\nFrom: HR\nSent: Tuesday\n\nCan you confirm?`],
  ['outlook bold header', `${NEW}\n\n**From:** HR\n**Sent:** Tuesday\n\nCan you confirm?`],
  ['forwarded it', `${NEW}\n\n---------- Messaggio inoltrato ----------\nDa: x`],
  ['signature', `${NEW}\n\n-- \nMario Rossi\nCEO`],
  ['signature no space', `${NEW}\n-- \nMario`],
  ['mobile footer en', `${NEW}\n\nSent from my iPhone`],
  ['mobile footer it', `${NEW}\n\nInviato da iPhone`],
  ['crlf', `${NEW}\r\n\r\nOn Tue, 3 Mar 2026 at 10:15, A <a@b.c> wrote:\r\n> hi`],
  ['quote lines only', `${NEW}\n> old line\n> older line`],
];

describe('stripQuotedReply', () => {
  it.each(cases)('keeps only the new text: %s', (_name, input) => {
    expect(stripQuotedReply(input)).toBe(NEW);
  });

  it('keeps inline replies between quoted lines', () => {
    const input = '> Quando?\nGiovedì\n> Dove?\nIn sede';
    expect(stripQuotedReply(input)).toBe('Giovedì\nIn sede');
  });

  it('keeps multi-paragraph new text', () => {
    const input = 'Ciao,\n\nprimo punto.\n\nSecondo punto.\n\nOn Mon, 2 Mar 2026, X wrote:\n> q';
    expect(stripQuotedReply(input)).toBe('Ciao,\n\nprimo punto.\n\nSecondo punto.');
  });

  it('does not cut on ordinary sentences starting with On or Il', () => {
    const input = 'On Monday I am free.\nIl lunedì sono libero e non scrivo altro.';
    expect(stripQuotedReply(input)).toBe(input);
  });

  it('does not cut a lone From: line without header siblings', () => {
    expect(stripQuotedReply('From: Milano, con piacere')).toBe('From: Milano, con piacere');
  });

  it('falls back to the whole text when everything is quoted', () => {
    expect(stripQuotedReply('> only quote')).toBe('> only quote');
    expect(stripQuotedReply('-- \nsig only')).toBe('-- \nsig only');
  });

  it('returns an empty string for empty input', () => {
    expect(stripQuotedReply('')).toBe('');
  });
});
