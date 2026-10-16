import { makePdf, makeZip } from './files';
import { token } from './unique';

const DAY_MS = 86_400_000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

export interface MigrationFixture {
  /** The package ZIP, ready to upload. */
  readonly zip: Buffer;
  readonly sourceSystem: string;
  readonly jobs: { readonly backend: string; readonly analyst: string };
  /** The stage both jobs call the same, which needs a choice in the wizard. */
  readonly sharedStage: string;
  /** Someone with a consent date and a CV, a rejected application, an external note and a historical email. */
  readonly ada: { readonly first: string; readonly last: string; readonly email: string };
  /** No consent date and no CV: asked to reconfirm. A hired application. */
  readonly carla: { readonly first: string; readonly last: string; readonly email: string };
  /** Retention already over: left out of the migration. */
  readonly bruno: { readonly first: string; readonly last: string; readonly email: string };
  readonly externalAuthor: string;
  readonly noteText: string;
  readonly emailSubject: string;
}

/**
 * A migration package built in code (`docs/schema/migration-package.v1.json`): two closed jobs, a stage named alike in
 * both that needs mapping, a candidate with a consent date and a CV, one without a CV and without a consent date, one
 * whose retention already expired, a note by someone who is not a member and a historical email. Dates are relative to
 * today, so the stage history falls inside the reports' "last 12 months".
 */
export const buildMigrationPackage = (): MigrationFixture => {
  const id = token();
  const sharedStage = `Candidatura ${id}`;
  const ada = { first: 'Ada', last: `Migrata${id}`, email: `e2e-mig-ada-${id}@e2e.test` };
  const carla = { first: 'Carla', last: `Senzacv${id}`, email: `e2e-mig-carla-${id}@e2e.test` };
  const bruno = { first: 'Bruno', last: `Scaduto${id}`, email: `e2e-mig-bruno-${id}@e2e.test` };
  const jobs = { backend: `Archivio Backend ${id}`, analyst: `Archivio Analyst ${id}` };
  const externalAuthor = 'Mario Esterno';
  const noteText = `Colloquio solido, buona esperienza di team ${id}`;
  const emailSubject = `Esito della selezione ${id}`;

  const manifest = {
    format: 'candydati-migration',
    version: 1,
    source: { system: 'oldats', exportedAt: daysAgo(1), producer: 'e2e@1' },
    users: [],
    jobs: [
      { ref: 'j1', title: jobs.backend, status: 'closed', createdAt: daysAgo(300), closedAt: daysAgo(200), stages: [{ ref: 's1', name: sharedStage }, { ref: 's2', name: 'Colloquio HR', type: 'hr_interview' }] },
      { ref: 'j2', title: jobs.analyst, status: 'closed', createdAt: daysAgo(280), closedAt: daysAgo(150), stages: [{ ref: 't1', name: sharedStage }, { ref: 't2', name: 'Colloquio tecnico', type: 'technical_interview' }] },
    ],
    candidates: [
      { ref: 'c1', firstName: ada.first, lastName: ada.last, email: ada.email, tags: [], createdAt: daysAgo(290), consent: { givenAt: daysAgo(10) } },
      { ref: 'c2', firstName: bruno.first, lastName: bruno.last, email: bruno.email, tags: [], createdAt: daysAgo(900), consent: { givenAt: daysAgo(900), expiresAt: daysAgo(100) } },
      { ref: 'c3', firstName: carla.first, lastName: carla.last, email: carla.email, tags: [], createdAt: daysAgo(270) },
    ],
    applications: [
      {
        ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's2', createdAt: daysAgo(290), outcome: 'not_selected', closedAt: daysAgo(210),
        files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv-ada.pdf' }],
        stageHistory: [{ stageRef: 's1', enteredAt: daysAgo(290) }, { stageRef: 's2', enteredAt: daysAgo(250) }],
      },
      {
        ref: 'a2', candidateRef: 'c3', jobRef: 'j2', stageRef: 't2', createdAt: daysAgo(270), outcome: 'hired', closedAt: daysAgo(160),
        files: [],
        stageHistory: [{ stageRef: 't1', enteredAt: daysAgo(270) }, { stageRef: 't2', enteredAt: daysAgo(240) }],
      },
      { ref: 'a3', candidateRef: 'c2', jobRef: 'j1', stageRef: 's1', createdAt: daysAgo(900), outcome: 'withdrawn', closedAt: daysAgo(890), files: [], stageHistory: [] },
    ],
    notes: [{ candidateRef: 'c1', applicationRef: 'a1', authorName: externalAuthor, body: noteText, createdAt: daysAgo(250) }],
    messages: [{ applicationRef: 'a1', direction: 'outbound', at: daysAgo(205), subject: emailSubject, body: 'Grazie per il tempo dedicato: abbiamo scelto un altro profilo.' }],
  };

  const zip = makeZip({
    'migration.json': JSON.stringify(manifest),
    'files/a1/cv.pdf': makePdf([`${ada.first} ${ada.last}`, ada.email, 'Sviluppatrice backend, 6 anni di esperienza con Node.js']),
  });
  return { zip, sourceSystem: 'oldats', jobs, sharedStage, ada, carla, bruno, externalAuthor, noteText, emailSubject };
};
