import { z } from 'zod';
import { JsonReaderError, type DownloadResult, type DownloadStore, type JsonReader } from '../../../http/index.js';
import { tokenSchema } from './schemas.js';

/** Where Harvest v3 lives. Overridable only so tests can point at a local server. */
export interface GreenhouseUrls {
  /** https://harvestdocs.greenhouse.io/docs/authentication.md */
  readonly token: string;
  /** https://harvestdocs.greenhouse.io/docs/pagination.md */
  readonly api: string;
}

export const GREENHOUSE_URLS: GreenhouseUrls = { token: 'https://auth.greenhouse.io/token', api: 'https://harvest.greenhouse.io/v3' };

export interface GreenhouseCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Largest page the docs allow; the cursor URL carries it from then on. */
export const PAGE_SIZE = 500;
/** Renew a little before the token says it expires. */
const EXPIRY_MARGIN_MS = 60_000;

export interface GreenhouseClientOptions {
  readonly urls?: GreenhouseUrls | undefined;
  readonly now?: (() => number) | undefined;
}

export interface GreenhouseClient {
  /** Every item of a list endpoint, page by page, following the `Link: rel="next"` URL exactly. */
  pages<S extends z.ZodType>(path: string, params: Readonly<Record<string, string>>, item: S): AsyncGenerator<readonly z.output<S>[]>;
  /** Streams one file; the bearer is sent only to the API host. */
  download(url: string, store: DownloadStore): Promise<DownloadResult>;
}

/** The URL of the next page, from the RFC 5988 `Link` header; undefined on the last page. */
export function nextLink(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(/,\s*(?=<)/)) {
    const match = /^\s*<([^>]+)>(.*)$/.exec(part);
    if (match && /;\s*rel\s*=\s*"?next"?/i.test(match[2] ?? '')) return match[1];
  }
  return undefined;
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    throw new JsonReaderError('host_not_allowed');
  }
};

const basic = ({ clientId, clientSecret }: GreenhouseCredentials): string => `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

/**
 * Harvest v3 over the reader: OAuth client-credentials token (renewed before expiry and once on a 401), cursor
 * pagination (`per_page` only on the first request), nothing else. Failures are the reader's own `JsonReaderError`s.
 */
export function createGreenhouseClient(reader: JsonReader, credentials: GreenhouseCredentials, options: GreenhouseClientOptions = {}): GreenhouseClient {
  const urls = options.urls ?? GREENHOUSE_URLS;
  const now = options.now ?? Date.now;
  const apiOrigin = new URL(urls.api).origin;
  let token: { readonly value: string; readonly expiresAt: number } | undefined;

  const refresh = async (): Promise<string> => {
    try {
      const { data } = await reader.postForm(urls.token, { grant_type: 'client_credentials' }, tokenSchema, { headers: { authorization: basic(credentials) } });
      token = { value: data.access_token, expiresAt: data.expires_in === undefined ? Number.POSITIVE_INFINITY : now() + data.expires_in * 1000 - EXPIRY_MARGIN_MS };
      return data.access_token;
    } catch (error) {
      // An OAuth server answers a wrong id or secret with 400 invalid_client as often as with 401.
      if (error instanceof JsonReaderError && error.code === 'source_invalid_response' && error.status === 400) throw new JsonReaderError('credentials_refused', 400);
      throw error;
    }
  };
  const bearer = async (): Promise<string> => (token !== undefined && token.expiresAt > now() ? token.value : refresh());
  const headers = (value: string) => ({ headers: { authorization: `Bearer ${value}` } });

  /** One GET with the bearer; on a 401 the token is renewed and the request repeated once. */
  const get = async <S extends z.ZodType>(url: string, schema: S) => {
    try {
      return await reader.getJson(url, schema, headers(await bearer()));
    } catch (error) {
      if (!(error instanceof JsonReaderError) || error.code !== 'credentials_refused' || error.status !== 401) throw error;
      return reader.getJson(url, schema, headers(await refresh()));
    }
  };

  return {
    async *pages(path, params, item) {
      const query = new URLSearchParams({ ...params, per_page: String(PAGE_SIZE) });
      let url: string | undefined = `${urls.api}/${path}?${query.toString()}`;
      while (url !== undefined) {
        const page = await get(url, z.array(item));
        yield page.data;
        const next = nextLink(page.headers.link);
        if (next !== undefined && new URL(next, url).origin !== apiOrigin) throw new JsonReaderError('source_invalid_response');
        url = next === undefined ? undefined : new URL(next, url).toString();
      }
    },
    async download(url, store) {
      const sameHost = originOf(url) === apiOrigin;
      return reader.download(url, store, sameHost ? headers(await bearer()) : undefined);
    },
  };
}
