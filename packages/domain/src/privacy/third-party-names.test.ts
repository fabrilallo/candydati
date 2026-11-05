import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput, hostileText } from '../testing/linear-time.js';
import { NAME_MARKER, replaceMarkedNames } from './third-party-names.js';

const N = NAME_MARKER;

describe('replaceMarkedNames', () => {
  it('reads reference headings in French, German and Spanish', () => {
    expect(replaceMarkedNames('Références\nNicolas Garnier, CTO')).toBe(`Références\n${N}, CTO`);
    expect(replaceMarkedNames('Referenzen\nStefan Wagner, Teamleiter')).toBe(`Referenzen\n${N}, Teamleiter`);
    expect(replaceMarkedNames('Referencias laborales\nPedro Sánchez, CTO')).toBe(`Referencias laborales\n${N}, CTO`);
  });

  it('reads titles of other languages and lower-case Italian titles', () => {
    expect(replaceMarkedNames('Mme Isabelle Moreau, Madame Anne Dumont, Monsieur Paul Roux')).toBe(`Mme ${N}, Madame ${N}, Monsieur ${N}`);
    expect(replaceMarkedNames('Herrn Markus Hoffmann, Frau Anna Schmidt, Mag. Thomas Bauer')).toBe(`Herrn ${N}, Frau ${N}, Mag. ${N}`);
    expect(replaceMarkedNames('Dña. Carmen Ruiz, Dra. Elena Vidal, Lic. Ricardo Torres')).toBe(`Dña. ${N}, Dra. ${N}, Lic. ${N}`);
    expect(replaceMarkedNames('relatore: prof. Giovanni Russo, dott. Luca Neri')).toBe(`relatore: prof. ${N}, dott. ${N}`);
    expect(replaceMarkedNames('avec M. Thomas Girard')).toBe(`avec M. ${N}`);
    expect(replaceMarkedNames('Leitung von Frau Dr. Anna Schmidt')).toBe(`Leitung von Frau Dr. ${N}`);
  });

  it('keeps words after titles that are not names', () => {
    const text = 'Sr. Software Engineer, M. Sc. Informatik, M. Sc, Lic. en Actuaría, Don Quijote';
    expect(replaceMarkedNames(text)).toBe(text);
  });

  it('reads names with an apostrophe or a hyphen', () => {
    expect(replaceMarkedNames("Mr. Kevin O'Brien e Dott. Jean-Pierre Martin")).toBe(`Mr. ${N} e Dott. ${N}`);
  });

  it('reads a name after a phrase that introduces a person', () => {
    const cases = [
      ['reporting to Sarah Collins', 'reporting to'],
      ['My manager, Tom Baker, nominated me', 'My manager,'],
      ['Worked under Sophie Gagnon', 'Worked under'],
      ['con la mia responsabile Chiara Colombo', 'con la mia responsabile'],
      ['Riportavo a Paolo Ricci', 'Riportavo a'],
      ['Avec mon collègue Julien Petit', 'Avec mon collègue'],
      ['Encadré par Marie Fournier', 'Encadré par'],
      ['Mit meiner Kollegin Laura Becker', 'Mit meiner Kollegin'],
      ['Reporto directamente a Marta Jiménez', 'Reporto directamente a'],
      ['Junto a mi compañero Javier Moreno', 'Junto a mi compañero'],
      ['Mi jefa era Verónica Castillo', 'Mi jefa era'],
    ] as const;
    for (const [text, phrase] of cases) expect(replaceMarkedNames(text)).toBe(`${phrase} ${N}${text.endsWith('me') ? ', nominated me' : ''}`);
  });

  it('keeps products and teams after those phrases', () => {
    const text = 'reporting to the CTO, my manager approved, mi jefe de proyecto, reporting to Head of Sales';
    expect(replaceMarkedNames(text)).toBe(text);
  });

  it('removes elsewhere in the text a full name it found in a marked place', () => {
    const cv = 'Charge nurse: Grace Thompson.\n\nReferees\nGrace Thompson, Nurse Unit Manager, St Vincent\'s\n\nSt Vincent\'s Hospital';
    expect(replaceMarkedNames(cv)).toBe(`Charge nurse: ${N}.\n\nReferees\n${N}, ${N}, ${N}\n\nSt Vincent's Hospital`);
  });

  it('runs in linear time on hostile input', () => {
    const shapes = ['Mme Aa ', 'M. Aa ', 'reporting to Aa ', "O'Aa ", 'Aa-Bb ', 'Referencias\nAa Bb ', 'mi jefa era Aa '];
    for (const unit of shapes) {
      expectLinearOnHostileInput((length) => { replaceMarkedNames(hostileText(unit, length)); });
    }
  }, 20_000);
});
