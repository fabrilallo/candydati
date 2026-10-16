import { z } from 'zod';
import { defineMigrationConnector, type MigrationConnector } from '../../connector.js';
import { createGreenhouseClient, GREENHOUSE_URLS, type GreenhouseCredentials, type GreenhouseUrls } from './client.js';
import { readGreenhouse } from './fetch.js';

export const greenhouseCredentialsSchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500),
});

const HOW_TO = 'https://harvestdocs.greenhouse.io/docs/authentication';

/**
 * Greenhouse Harvest v3 (OAuth 2.0 client credentials), built on the public documentation. Harvest v1 and v2 were
 * retired on 2026-08-31. `urls` is for tests only: the registered connector uses Greenhouse's own hosts.
 */
export function createGreenhouseConnector(urls: GreenhouseUrls = GREENHOUSE_URLS): MigrationConnector<GreenhouseCredentials> {
  return defineMigrationConnector<GreenhouseCredentials>({
    id: 'greenhouse',
    label: 'Greenhouse',
    maturity: 'beta',
    input: 'api',
    docsUrl: 'https://harvestdocs.greenhouse.io/',
    fields: [
      {
        name: 'clientId',
        label: { en: 'Client ID', it: 'Client ID' },
        help: {
          en: 'From Dev Center, API Credentials: create "Harvest V3 (OAuth)" credentials with read-only (list) permissions. Never grant EEOC or demographic permissions. Also grant the "private data" permission, or private notes come across empty.',
          it: 'Da Dev Center, API Credentials: crea credenziali "Harvest V3 (OAuth)" con soli permessi di lettura (list). Non concedere mai permessi EEOC o demografici. Concedi anche il permesso "private data", altrimenti le note private arrivano vuote.',
        },
        type: 'text',
        secret: false,
        howToUrl: HOW_TO,
      },
      {
        name: 'clientSecret',
        label: { en: 'Client secret', it: 'Client secret' },
        help: { en: 'Shown once when the credentials are created. It is kept only while the migration runs.', it: 'Mostrato una sola volta alla creazione delle credenziali. Viene conservato solo mentre la migrazione è in corso.' },
        type: 'password',
        secret: true,
        howToUrl: HOW_TO,
      },
    ],
    credentials: greenhouseCredentialsSchema,
    hosts: () => [{ exact: new URL(urls.token).hostname }, { exact: new URL(urls.api).hostname }],
    // Documented: a fixed 30 s window (the example limit is 75). Stay well under it; the reader also obeys X-RateLimit-* and Retry-After.
    rate: { capacity: 5, refillPerSecond: 2 },
    fetch: (credentials, builder, tools) => readGreenhouse(createGreenhouseClient(tools.reader, credentials, { urls }), builder, tools),
  });
}

export const greenhouseConnector = createGreenhouseConnector();
