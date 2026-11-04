import { shuffled } from '../random.js';

/**
 * Invented people: common Italian first names and surnames combined at random, never a real person's data. Addresses
 * are on `demo.example.com` (reserved, RFC 2606): nothing sent to them can reach anyone.
 */
const FIRST_NAMES = [
  'Alessandro', 'Sara', 'Davide', 'Elena', 'Matteo', 'Martina', 'Lorenzo', 'Valentina', 'Simone', 'Federica',
  'Andrea', 'Chiara', 'Giorgio', 'Alice', 'Riccardo', 'Silvia', 'Tommaso', 'Giada', 'Stefano', 'Beatrice',
  'Pietro', 'Ilaria', 'Nicola', 'Arianna', 'Filippo', 'Camilla', 'Emanuele', 'Noemi', 'Gabriele', 'Irene',
  'Michele', 'Serena', 'Jacopo', 'Elisa', 'Daniele', 'Marta', 'Enrico', 'Laura', 'Samuele', 'Aurora',
] as const;

const LAST_NAMES = [
  'Bianchi', 'Colombo', 'Ricci', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa',
  'Giordano', 'Rizzo', 'Lombardi', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara',
  'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Serra', 'Coppola', 'De Santis',
  "D'Angelo", 'Marchetti', 'Parisi', 'Villa', 'Ferri', 'Fabbri', 'Bianco', 'Marini', 'Grasso', 'Valentini',
] as const;

export const DEMO_EMAIL_DOMAIN = 'demo.example.com';

export interface DemoPerson {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

/** `nome.cognome@demo.example.com`, ASCII only. */
export const emailOf = (firstName: string, lastName: string): string =>
  `${firstName}.${lastName}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z.]/g, '')
    .toLowerCase()
    .concat(`@${DEMO_EMAIL_DOMAIN}`);

/** `count` people with distinct names and addresses: first names and surnames are each used once at most. */
export function generatePeople(count: number, random: () => number): readonly DemoPerson[] {
  if (count > FIRST_NAMES.length || count > LAST_NAMES.length) throw new Error(`At most ${Math.min(FIRST_NAMES.length, LAST_NAMES.length)} demo people`);
  const firsts = shuffled(FIRST_NAMES, random);
  const lasts = shuffled(LAST_NAMES, random);
  return firsts.slice(0, count).map((firstName, index) => {
    const lastName = lasts[index] as string;
    return { firstName, lastName, email: emailOf(firstName, lastName) };
  });
}
