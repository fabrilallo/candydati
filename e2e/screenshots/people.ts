/** Invented people (no real person), on the reserved `example.com` domain. */

export interface Person {
  readonly firstName: string;
  readonly lastName: string;
  /** 0 is "received"; 1..n the declared stages of the Backend job, in order. */
  readonly stage: number;
  /** Lines of the generated CV: what the CV reader turns into the headline, city and years on the card. */
  readonly cv: readonly string[];
  readonly tags?: readonly string[];
  readonly notes?: readonly string[];
}

export const emailOf = (person: Pick<Person, 'firstName' | 'lastName'>): string =>
  `${person.firstName}.${person.lastName}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z.]/g, '')
    .toLowerCase()
    .concat('@example.com');

export const OWNER = { name: 'Giulia Rossi', email: 'giulia.rossi@example.com' } as const;
export const INTERVIEWER = { name: 'Luca Moretti', email: 'luca.moretti@example.com' } as const;

/** The candidate whose detail is captured: in the technical interview, with notes and feedback. */
export const FEATURED: Person = {
  firstName: 'Francesca',
  lastName: 'Marino',
  stage: 2,
  cv: ['Senior Backend Developer · Milano', '6 anni di esperienza con Node.js, TypeScript e PostgreSQL', 'Ha guidato la migrazione di un monolite a servizi'],
  tags: ['TypeScript', 'PostgreSQL'],
  notes: [
    'Chiamata molto buona: sei anni su Node.js, ha guidato la migrazione a PostgreSQL nel suo team attuale. Disponibile da gennaio.',
    'Preferisce il lavoro ibrido, le due giornate a Milano vanno bene. Chiede di conoscere il team prima del colloquio finale.',
  ],
};

export const PEOPLE: readonly Person[] = [
  { firstName: 'Alessandro', lastName: 'Bianchi', stage: 0, cv: ['Backend Developer · Torino', '4 anni di esperienza con Java e Spring Boot'] },
  { firstName: 'Sara', lastName: 'Colombo', stage: 0, cv: ['Software Engineer · Bologna', '5 anni di esperienza con Go e Kubernetes'], tags: ['Go'] },
  { firstName: 'Davide', lastName: 'Ricci', stage: 0, cv: ['Full Stack Developer · Roma', '3 anni di esperienza con Node.js e React'] },
  { firstName: 'Elena', lastName: 'Greco', stage: 1, cv: ['Backend Engineer · Milano', '7 anni di esperienza con Python, Django e PostgreSQL'], notes: ['Da richiamare giovedì mattina, preferisce dopo le 10.'] },
  { firstName: 'Matteo', lastName: 'Bruno', stage: 1, cv: ['Java Developer · Verona', '8 anni di esperienza con Java, Kafka e Oracle'], tags: ['Java'] },
  { firstName: 'Martina', lastName: 'Gallo', stage: 1, cv: ['Backend Developer · Firenze', '4 anni di esperienza con TypeScript e NestJS'] },
  FEATURED,
  { firstName: 'Lorenzo', lastName: 'Conti', stage: 2, cv: ['Senior Software Engineer · Padova', '9 anni di esperienza con Kotlin e PostgreSQL'], tags: ['Kotlin'] },
  { firstName: 'Valentina', lastName: 'De Luca', stage: 3, cv: ['Platform Engineer · Milano', '6 anni di esperienza con Go, AWS e Terraform'], notes: ['Ottima impressione sul team, molto chiara nello spiegare le scelte.'] },
  { firstName: 'Simone', lastName: 'Mancini', stage: 4, cv: ['Tech Lead · Bergamo', '10 anni di esperienza con TypeScript, Node.js e AWS'], tags: ['TypeScript'] },
];
