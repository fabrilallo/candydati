import { jobContentSchema, type JobContent } from '../content.js';

/** A compliant Italian ad: tests change one field and look at what `checkCompliance` says. Not exported from the index. */
export const adContent = (overrides: Record<string, unknown> = {}): JobContent =>
  jobContentSchema.parse({
    title: 'Backend Developer',
    language: 'it',
    summary: 'Costruiamo prodotti per le aziende.',
    responsibilities: ['Progettare API', 'Scrivere test', 'Monitorare il servizio'],
    requirements: { mustHave: ['3 anni con TypeScript'], niceToHave: ['Go'] },
    ...overrides,
  });
