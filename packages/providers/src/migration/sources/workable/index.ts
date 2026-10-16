import { z } from 'zod';
import { defineMigrationConnector, type MigrationConnector } from '../../connector.js';
import { createWorkableClient, SUBDOMAIN_PATTERN } from './client.js';
import { importWorkable } from './run.js';

/** Account subdomain (one DNS label, so the host is always `{label}.workable.com`) and the API access token. */
export const workableCredentialsSchema = z.strictObject({
  subdomain: z.string().trim().toLowerCase().regex(SUBDOMAIN_PATTERN, 'subdomain'),
  accessToken: z.string().trim().min(8).max(4096),
});
export type WorkableCredentials = z.infer<typeof workableCredentialsSchema>;

export interface WorkableConnectorOptions {
  /** TESTS ONLY: where the API lives (a local server). Never set in production code. */
  readonly unsafeBaseUrlForTests?: ((subdomain: string) => string) | undefined;
}

/**
 * Workable (SPI v3), built on the public documentation and not verified on a real account (ADR 0009, decision 6).
 * Account tokens are limited to 10 requests per 10 seconds: a bucket of 2 refilled at 0.8 per second never exceeds 10 in
 * any 10 second window.
 */
export function createWorkableConnector(options: WorkableConnectorOptions = {}): MigrationConnector<WorkableCredentials> {
  return defineMigrationConnector({
    id: 'workable',
    label: 'Workable',
    maturity: 'beta',
    input: 'api',
    docsUrl: 'https://workable.readme.io/reference',
    fields: [
      {
        name: 'subdomain',
        label: { en: 'Account subdomain', it: 'Sottodominio dell\'account' },
        help: { en: 'The part before .workable.com in your account address: for acme.workable.com, type acme.', it: 'La parte prima di .workable.com nell\'indirizzo del tuo account: per acme.workable.com, scrivi acme.' },
        type: 'text',
        secret: false,
        placeholder: 'acme',
      },
      {
        name: 'accessToken',
        label: { en: 'API access token', it: 'Token di accesso API' },
        help: { en: 'Under Integrations, Generate new token, with the read scopes r_jobs and r_candidates. Shown once by Workable.', it: 'In Integrazioni, Genera nuovo token, con gli ambiti di lettura r_jobs e r_candidates. Workable lo mostra una sola volta.' },
        type: 'password',
        secret: true,
        howToUrl: 'https://workable.readme.io/reference/generate-an-access-token',
      },
    ],
    credentials: workableCredentialsSchema,
    hosts: () => [{ subdomainOf: 'workable.com' }],
    rate: { capacity: 2, refillPerSecond: 0.8 },
    async fetch(credentials, builder, tools) {
      const baseUrl = options.unsafeBaseUrlForTests?.(credentials.subdomain) ?? `https://${credentials.subdomain}.workable.com/spi/v3`;
      await importWorkable(createWorkableClient(tools.reader, baseUrl, credentials.accessToken), builder, tools.progress);
    },
  });
}

export const workableConnector = createWorkableConnector();
