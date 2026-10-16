import { describe, expect, it } from 'vitest';
import { matchCvs, type CvSubject } from './cv-match.js';

const subject = (n: number, over: Partial<CvSubject> = {}): CvSubject => ({ applicationRef: `a${n}`, candidateRef: `c${n}`, fileCell: null, email: null, fullName: `Persona ${n}`, ...over });

describe('matchCvs', () => {
  it('prefers the file column, matching by path or by name without extension, accents and case', () => {
    const result = matchCvs([subject(1, { fileCell: 'cv/Curriculum Rossi.PDF' }), subject(2, { fileCell: 'curriculum bianchi' })], ['x/cv/Curriculum Rossi.pdf', 'Curriculum Bianchi.docx']);
    expect([...result.byApplication]).toEqual([['a1', 0], ['a2', 1]]);
    expect(result.unmatched).toBe(0);
  });

  it('then finds the email in the file name, then the full name in any order', () => {
    const subjects = [subject(1, { email: 'ada.bianchi@example.com', fullName: 'Ada Bianchi' }), subject(2, { fullName: 'Mario Rossi' })];
    const result = matchCvs(subjects, ['ada.bianchi@example.com cv.pdf', 'Rossi_Mario_CV_2024.pdf', 'altro.pdf']);
    expect([...result.byApplication]).toEqual([['a1', 0], ['a2', 1]]);
    expect(result.unmatched).toBe(1);
  });

  it('never gives one file to two applications, nor a second CV to a candidate who has one', () => {
    const subjects = [subject(1, { candidateRef: 'c', applicationRef: 'a1', fileCell: 'cv.pdf', fullName: 'Ada Bianchi' }), subject(2, { candidateRef: 'c', applicationRef: 'a2', fullName: 'Ada Bianchi' })];
    const result = matchCvs(subjects, ['cv.pdf', 'Ada Bianchi.pdf']);
    expect([...result.byApplication]).toEqual([['a1', 0]]);
    expect(result.unmatched).toBe(1);
  });

  it('attaches a name or email match to the first application of the candidate only', () => {
    const subjects = [subject(1, { candidateRef: 'c', applicationRef: 'first', fullName: 'Ada Bianchi' }), subject(2, { candidateRef: 'c', applicationRef: 'second', fullName: 'Ada Bianchi' })];
    expect([...matchCvs(subjects, ['bianchi ada.pdf']).byApplication]).toEqual([['first', 0]]);
  });

  it('does not guess between homonyms or between two files of the same name', () => {
    const homonyms = [subject(1, { fullName: 'Mario Rossi' }), subject(2, { fullName: 'Rossi Mario' })];
    expect(matchCvs(homonyms, ['Mario Rossi.pdf']).byApplication.size).toBe(0);
    expect(matchCvs([subject(3, { fullName: 'Mario Rossi' })], ['Mario Rossi.pdf', 'Rossi Mario CV.pdf']).byApplication.size).toBe(0);
  });

  it('matches nothing with no CV, and ignores a person without a name or email', () => {
    expect(matchCvs([subject(1, { fullName: '' })], ['a.pdf'])).toEqual({ byApplication: new Map(), unmatched: 1 });
    expect(matchCvs([subject(1)], [])).toEqual({ byApplication: new Map(), unmatched: 0 });
  });
});
