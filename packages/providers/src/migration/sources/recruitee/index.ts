import { z } from 'zod';
import { defineMigrationConnector, type MigrationConnector } from '../../connector.js';
import type { PackageBuilder } from '../../package-builder.js';
import type { RateOptions } from '../../../http/index.js';
import { createRecruiteeClient, RECRUITEE_API, type OptionalEndpoint, type RecruiteeClient } from './client.js';
import { emptyStats, importHit, type ImportContext, type RecruiteeStats, type RunStats } from './import-candidate.js';
import { createJobCollector } from './map.js';
import type { RecruiteeOffer } from './schemas.js';

/** Digits (the company id) or the company subdomain, the two forms `/c/{company_id}` accepts. */
const COMPANY = /^(?:[0-9]{1,12}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

export const recruiteeCredentialsSchema = z.strictObject({
  company: z.string().trim().toLowerCase().regex(COMPANY, 'company'),
  token: z.string().trim().min(8).max(300),
});
export type RecruiteeCredentials = z.infer<typeof recruiteeCredentialsSchema>;

export interface RecruiteeConnectorOptions {
  /** Tests point this at a local server; production never sets it. */
  readonly baseUrl?: string | undefined;
  /** Counters at the end of a run (also when it fails midway is not guaranteed): endpoints and reasons, no data. */
  readonly onSummary?: ((stats: RecruiteeStats) => void) | undefined;
  readonly onSkip?: ((endpoint: OptionalEndpoint, status: number | null) => void) | undefined;
  readonly now?: (() => Date) | undefined;
}

/**
 * Documented limit: 1000 requests a minute per token, with stricter limits announced from 15 October 2025 (value not
 * published). 5 a second stays far below and the reader also honours 429 and Retry-After.
 */
const RATE: RateOptions = { capacity: 5, refillPerSecond: 5 };
const PROGRESS_EVERY_MS = 15_000;

/** Offers of the account; an offer the list gives without its pipeline gets it from `/offers/:id`. */
async function loadOffers(client: RecruiteeClient): Promise<readonly RecruiteeOffer[]> {
  const offers = (await client.offers()) ?? [];
  const unique = [...new Map(offers.map((offer) => [offer.id, offer])).values()];
  const completed: RecruiteeOffer[] = [];
  for (const offer of unique) {
    if ((offer.pipeline_template?.stages ?? []).length > 0) completed.push(offer);
    else completed.push({ ...offer, pipeline_template: (await client.offerDetail(offer.id))?.pipeline_template ?? offer.pipeline_template });
  }
  return completed;
}

async function run(credentials: RecruiteeCredentials, builder: PackageBuilder, tools: Parameters<MigrationConnector['fetch']>[2], options: RecruiteeConnectorOptions): Promise<RunStats> {
  const stats = emptyStats();
  const now = options.now?.() ?? new Date();
  const client = createRecruiteeClient({ baseUrl: options.baseUrl ?? RECRUITEE_API, company: credentials.company, token: credentials.token, reader: tools.reader, onSkip: options.onSkip });
  await tools.progress(0, null);
  const jobs = createJobCollector(await loadOffers(client), now);
  const ctx: ImportContext = { client, builder, jobs, now };
  const seen = new Set<string>();
  let lastProgress = Date.now();
  let done = 0;
  for await (const page of client.searchPages()) {
    if (page.invalid > 0) stats.skipped['invalid_record'] = (stats.skipped['invalid_record'] ?? 0) + page.invalid;
    for (const hit of page.hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      await importHit(ctx, hit, stats);
      done += 1;
      if (Date.now() - lastProgress >= PROGRESS_EVERY_MS) {
        await tools.progress(done, page.total);
        lastProgress = Date.now();
      }
    }
    await tools.progress(done, page.total);
    lastProgress = Date.now();
  }
  for (const job of jobs.jobs()) builder.addJob(job);
  return stats;
}

export function createRecruiteeConnector(options: RecruiteeConnectorOptions = {}): MigrationConnector<RecruiteeCredentials> {
  return defineMigrationConnector({
    id: 'recruitee',
    label: 'Recruitee',
    maturity: 'beta',
    input: 'api',
    docsUrl: 'https://docs.recruitee.com/reference/getting-started',
    fields: [
      {
        name: 'company',
        label: { en: 'Company ID or subdomain', it: 'ID azienda o sottodominio' },
        help: { en: 'The number in Settings, Company settings, General, or your Recruitee subdomain.', it: 'Il numero in Impostazioni, Impostazioni azienda, Generale, oppure il sottodominio Recruitee.' },
        type: 'text',
        secret: false,
        placeholder: '12345',
      },
      {
        name: 'token',
        label: { en: 'Personal API token', it: 'Token API personale' },
        help: { en: 'Created by an admin in Settings, Apps and plugins, Personal API tokens. It has the creator\'s permissions.', it: 'Creato da un amministratore in Impostazioni, App e plugin, Token API personali. Ha i permessi di chi lo crea.' },
        type: 'password',
        secret: true,
        howToUrl: 'https://support.recruitee.com/en/articles/8213076-faq-api',
      },
    ],
    credentials: recruiteeCredentialsSchema,
    hosts: () => [{ exact: 'api.recruitee.com' }],
    rate: RATE,
    async fetch(credentials, builder, tools) {
      const stats = await run(credentials, builder, tools, options);
      options.onSummary?.(stats);
    },
  });
}

export const recruiteeConnector = createRecruiteeConnector();
