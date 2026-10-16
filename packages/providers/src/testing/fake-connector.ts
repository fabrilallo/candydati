import { z } from 'zod';
import { JsonReaderError, type JsonReaderErrorCode } from '../http/index.js';
import { defineMigrationConnector, type MigrationConnector } from '../migration/connector.js';
import type { PackageBuilder } from '../migration/package-builder.js';
import { makePdf } from './fixtures.js';

/**
 * TEST ONLY. A connector that reads nothing from the network: it writes `jobs` closed jobs with `perJob` applications
 * each (one CV per application) through the builder, so the whole pipeline (fetch, split, analysis, preview, commit) can
 * run in tests. Never registered in a production build. `failWith` makes it fail like a vendor API would.
 */
export interface FakeConnectorOptions {
  readonly jobs?: number;
  readonly perJob?: number;
  readonly failWith?: JsonReaderErrorCode | 'crash';
  /** Seen by the test: the credentials the connector was given. */
  readonly onFetch?: (credentials: FakeCredentials) => void;
}

export const fakeCredentialsSchema = z.strictObject({ apiKey: z.string().min(8).max(200), subdomain: z.string().regex(/^[a-z0-9-]{1,63}$/) });
export type FakeCredentials = z.infer<typeof fakeCredentialsSchema>;

const T0 = Date.UTC(2025, 0, 10, 9);
const at = (days: number): string => new Date(T0 + days * 86_400_000).toISOString();

async function writeJob(builder: PackageBuilder, j: number, perJob: number): Promise<void> {
  builder.addJob({ ref: `job-${j}`, title: `Ruolo ${j}`, status: 'closed', createdAt: at(j), closedAt: at(j + 60), stages: [{ ref: 'applied', name: 'Candidatura' }, { ref: 'hr', name: 'Colloquio HR', type: 'hr_interview' }] });
  for (let i = 0; i < perJob; i += 1) {
    const person = `person-${j}-${i}`;
    builder.addCandidate({ ref: person, firstName: 'Persona', lastName: `Prova ${j} ${i}`, email: `${person}@example.com`, createdAt: at(j + 1), consent: { givenAt: at(j + 1) } });
    const ref = `application-${j}-${i}`;
    builder.addApplication({ ref, candidateRef: person, jobRef: `job-${j}`, stageRef: 'hr', createdAt: at(j + 1), outcome: 'not_selected', closedAt: at(j + 30), stageHistory: [{ stageRef: 'hr', enteredAt: at(j + 5) }] });
    builder.addNote({ candidateRef: person, applicationRef: ref, authorName: 'Selezione', body: 'Colloquio svolto', createdAt: at(j + 6) });
    const pdf = makePdf([`Persona Prova ${j} ${i}`, 'Esperienza: sviluppo software']);
    await builder.addFile(ref, { kind: 'cv', fileName: `cv-${j}-${i}.pdf` }, (store) => store((async function* () { yield pdf; })(), 'application/pdf'));
  }
}

export function createFakeConnector(options: FakeConnectorOptions = {}): MigrationConnector<FakeCredentials> {
  const jobs = options.jobs ?? 2;
  const perJob = options.perJob ?? 2;
  return defineMigrationConnector({
    id: 'fake-ats',
    label: 'Fake ATS',
    maturity: 'beta',
    input: 'api',
    docsUrl: 'https://docs.example.com/fake-ats',
    fields: [
      { name: 'apiKey', label: { en: 'API key', it: 'Chiave API' }, help: { en: 'Read-only key.', it: 'Chiave di sola lettura.' }, type: 'password', secret: true, howToUrl: 'https://docs.example.com/fake-ats/keys' },
      { name: 'subdomain', label: { en: 'Subdomain', it: 'Sottodominio' }, type: 'text', secret: false, placeholder: 'acme' },
    ],
    credentials: fakeCredentialsSchema,
    hosts: () => [{ subdomainOf: 'fake-ats.example.com' }],
    async fetch(credentials, builder, tools) {
      options.onFetch?.(credentials);
      if (options.failWith === 'crash') throw new Error('fake connector crashed');
      if (options.failWith !== undefined) throw new JsonReaderError(options.failWith, 500);
      await tools.progress(0, jobs * perJob);
      for (let j = 0; j < jobs; j += 1) {
        await writeJob(builder, j, perJob);
        await tools.progress((j + 1) * perJob, jobs * perJob);
      }
    },
  });
}
