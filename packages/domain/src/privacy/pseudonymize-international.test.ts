import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { pseudonymizeText, REDACTED } from './pseudonymize.js';

const rossi = { lastName: 'Rossi' };
const clean = (text: string, lastName = 'Rossi'): string => pseudonymizeText(text, { lastName });

describe('pseudonymizeText outside Italy', () => {
  it.each(['+33 6 98 76 54 32', '+33 (0)7 55 50 12 34', '+44 (0)20 7946 0321', '+54 9 11 5555-0123', '+49 (0)89 5550 4321'])(
    'removes the phone number %s with a one-digit area or a (0) trunk prefix',
    (phone) => {
      expect(clean(`Tel. ${phone}, merci`)).toBe(`Tel. ${REDACTED.phone}, merci`);
    },
  );

  it('keeps short numbers that follow a country-like prefix', () => {
    expect(clean('Score +3 5 punti, 2 3 4')).toBe('Score +3 5 punti, 2 3 4');
  });

  it.each([
    ['Née le 4 avril 1992 à Lyon', 'Née le [date] à Lyon'],
    ['Né le 1er janvier 1990', 'Né le [date]'],
    ['geb. am 7. Juli 1988', 'geb. am [date]'],
    ['Geboren: 3. März 1991', 'Geboren: [date]'],
    ['Fecha de nacimiento: 15 de marzo de 1992', 'Fecha de nacimiento: [date]'],
    ['Date of birth: 3rd March 1990', 'Date of birth: [date]'],
    ['Born March 4, 1991 in Leeds', 'Born [date] in Leeds'],
    ['Born 1992-07-14', 'Born [date]'],
  ])('removes the full date in %s', (text, expected) => {
    expect(clean(text)).toBe(expected);
  });

  it('keeps months with a year only, periods and ISO-like ranges', () => {
    const text = 'Jan 2021 - Present, May 2017, mars 2019, 2018-2021, März 2020 - heute, enero de 2020';
    expect(clean(text)).toBe(text);
  });

  it.each([
    ['12 rue des Lilas, 75011 Paris', `${REDACTED.address}`],
    ['45 bis avenue Jean Jaurès, 69007 Lyon', `${REDACTED.address}`],
    ["3 place de l'Église, 31000 Toulouse", `${REDACTED.address}`],
    ['Chemin des Vignes 8, 1004 Lausanne', `${REDACTED.address}`],
    ['Rue de la Loi 160, 1040 Bruxelles', `${REDACTED.address}`],
    ['Hauptstraße 12, 10115 Berlin', `${REDACTED.address}`],
    ['Leopoldstr. 45a, 80802 München', `${REDACTED.address}`],
    ['Mariahilfer Straße 88/5, 1060 Wien', `${REDACTED.address}`],
    ['Calle de Alcalá 123, 4º B, 28009 Madrid', `${REDACTED.address}, 4º B, ${REDACTED.address}`],
    ['C/ Mayor, 12, 3º 2ª, 08002 Barcelona', `${REDACTED.address}, 3º 2ª, ${REDACTED.address}`],
    ['Av. Corrientes 1234, piso 5, C1043 CABA', `${REDACTED.address}, piso 5, ${REDACTED.address}`],
    ['1450 Maple Avenue, Apt 3B, Austin, TX 78701', `${REDACTED.address}, Apt 3B, Austin, TX ${REDACTED.address}`],
    ['88 Queen Street West, Toronto, ON M5H 2M9', `${REDACTED.address} West, Toronto, ON ${REDACTED.address}`],
    ['12 Smith Street, Fitzroy VIC 3065', `${REDACTED.address}, Fitzroy VIC ${REDACTED.address}`],
  ])('removes the address %s', (address, expected) => {
    expect(clean(`Adresse: ${address}`)).toBe(`Adresse: ${expected}`);
  });

  it('keeps ordinary words and numbers that look like streets or postal codes', () => {
    const text = 'Platz 1 im Ranking, Route 66, Monitoring 24/7, Plaza Mayor, Team von 20121 Leuten, Budget 50000 Euro, rue 12 ans';
    expect(clean(text)).toBe(text);
    expect(clean('Via Roma 10, 00184 Roma · nata nel 1990')).toBe(`${REDACTED.address} · nata nel 1990`);
  });

  it('removes Spanish DNI and NIE numbers with a valid check letter, and labelled national ids', () => {
    expect(clean('DNI: 12345678Z, NIE X1234567L')).toBe(`DNI: ${REDACTED.idNumber}, NIE ${REDACTED.idNumber}`);
    expect(clean('Pedido 12345678A')).toBe('Pedido 12345678A');
    expect(clean('DNI 30.123.456, RFC: HEOA920315AB1, CURP HEOA920315MDFRRN09')).toBe(
      `DNI ${REDACTED.idNumber}, RFC: ${REDACTED.idNumber}, CURP ${REDACTED.idNumber}`,
    );
    expect(clean('Ho un DNI valido')).toBe('Ho un DNI valido');
  });

  it('removes personal sites on more country domains', () => {
    expect(clean('Site: lefebvre-dev.fr, oliverh.co.uk/blog, martin.com.ar e studio.ch')).toBe(
      `Site: ${REDACTED.link}, ${REDACTED.link}, ${REDACTED.link} e ${REDACTED.link}`,
    );
    expect(clean('Lavoro in Spagna, fin de semana, Node.js')).toBe('Lavoro in Spagna, fin de semana, Node.js');
  });

  it('removes profiles on xing, viadeo and malt and handles written after a profile name', () => {
    expect(clean('xing.com/profile/Lukas_Mueller, malt.fr/profile/camille, viadeo.com/p/abc')).toBe(
      `${REDACTED.link}, ${REDACTED.link}, ${REDACTED.link}`,
    );
    expect(clean('GitHub: emjdev · Twitter: jb_92 · Instagram: hugo.lmbt')).toBe(
      `GitHub: ${REDACTED.handle} · Twitter: ${REDACTED.handle} · Instagram: ${REDACTED.handle}`,
    );
    expect(clean('GitHub: Actions e Copilot')).toBe('GitHub: Actions e Copilot');
  });

  it('removes the surname written without accents or transliterated', () => {
    expect(clean('LUCÍA GARCIA LOPEZ, Lucía García López', 'García López')).toBe(
      `LUCÍA ${REDACTED.surname}, Lucía ${REDACTED.surname}`,
    );
    expect(clean('Lukas Mueller, MUELLER, Müller', 'Müller')).toBe(`Lukas ${REDACTED.surname}, ${REDACTED.surname}, ${REDACTED.surname}`);
  });

  it('removes sites and handles that contain the surname, not words that contain it', () => {
    expect(clean('emilyjohnson.io · alessandrodeluca.com · ejohnson_92', 'Johnson')).toBe(
      `${REDACTED.link} · alessandrodeluca.com · ${REDACTED.handle}`,
    );
    expect(clean('alessandrodeluca.com', 'De Luca')).toBe(REDACTED.link);
    expect(clean('Johnsonville e Johnson.', 'Johnson')).toBe(`Johnsonville e ${REDACTED.surname}.`);
  });

  it('runs in linear time on hostile input', () => {
    const shapes = ['12 rue A ', 'Rue A ', 'Aastraße 1 ', 'C/ A ', '[address] 1 ', '1 de mar ', 'March 1 ', 'DNI 1', 'GitHub: a', 'x.co.', 'aa_rossi'];
    for (const unit of shapes) {
      expect(growthRatio((size) => pseudonymizeText(unit.repeat(size), rossi), 2000)).toBeLessThan(LINEAR_GROWTH_MAX);
    }
  });
});
