import { z } from 'zod';
import { defineMigrationConnector, type MigrationConnector } from '../../connector.js';
import { createTeamtailorClient } from './client.js';
import { readCandidates, readAnswers, readNotes, readUploads } from './read-people.js';
import { readApplications, readJobs, readUsers } from './read-structure.js';
import { emptyReport, type Run, type TeamtailorReport } from './run.js';

export { emptyReport, type TeamtailorReport } from './run.js';

/** https://docs.teamtailor.com/ (Authentication): the secret API key. */
export const teamtailorCredentialsSchema = z.strictObject({ apiKey: z.string().trim().min(8).max(200) });
export type TeamtailorCredentials = z.infer<typeof teamtailorCredentialsSchema>;

export interface TeamtailorConnectorOptions {
  /** Called when the run ends, with what was left out and why (counts only). */
  readonly onReport?: ((report: TeamtailorReport) => void) | undefined;
  /** TESTS ONLY: another API base URL (a local server). */
  readonly baseUrl?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

/** The API host, and the file host of the signed URLs shown in the docs' examples (uploads, resumes). */
const HOSTS = [{ exact: 'api.teamtailor.com' }, { exact: 'teamtailor-production.s3.amazonaws.com' }] as const;
const KEEP_ALIVE_MS = 10_000;

/**
 * Teamtailor connector (ADR 0009, beta: built on the public docs, not verified on a real account). Reads users, jobs,
 * stages, applications, candidates (with CV), uploads, notes and form answers; drops ratings, scores and pictures.
 */
export function createTeamtailorConnector(options: TeamtailorConnectorOptions = {}): MigrationConnector<TeamtailorCredentials> {
  return defineMigrationConnector({
    id: 'teamtailor',
    label: 'Teamtailor',
    maturity: 'beta',
    input: 'api',
    docsUrl: 'https://docs.teamtailor.com/',
    fields: [
      {
        name: 'apiKey',
        label: { en: 'Admin API key', it: 'Chiave API Admin' },
        help: { en: 'A key with Admin read permission (Settings, Integrations, API keys). It is used only for this transfer and is never stored.', it: 'Una chiave con permesso di lettura Admin (Impostazioni, Integrazioni, Chiavi API). Serve solo per questo trasferimento e non viene conservata.' },
        type: 'password',
        secret: true,
        howToUrl: 'https://docs.teamtailor.com/',
      },
    ],
    credentials: teamtailorCredentialsSchema,
    hosts: () => HOSTS,
    // The docs say the rate-limit headers are static: stay well below any real limit.
    rate: { capacity: 3, refillPerSecond: 3 },
    async fetch(credentials, builder, tools) {
      let done = 0;
      let lastReport = 0;
      const tick = async (count: number): Promise<void> => {
        done += count;
        if (count === 0 && Date.now() - lastReport < KEEP_ALIVE_MS) return;
        lastReport = Date.now();
        await tools.progress(done, null);
      };
      const report = emptyReport();
      const run: Run = { client: createTeamtailorClient(tools.reader, credentials.apiKey, options.baseUrl), builder, report, tick, now: (options.now?.() ?? new Date()).toISOString() };
      await tick(0);
      const users = await readUsers(run);
      const structure = await readJobs(run);
      const applications = await readApplications(run, structure);
      const answers = await readAnswers(run);
      const people = await readCandidates(run, applications, answers);
      await readUploads(run, people);
      await readNotes(run, people, users);
      options.onReport?.(report);
    },
  });
}

export const teamtailorConnector: MigrationConnector<TeamtailorCredentials> = createTeamtailorConnector();
