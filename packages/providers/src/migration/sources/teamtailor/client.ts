import { JsonReaderError, type DownloadStore, type JsonPage, type JsonReader } from '../../../http/index.js';
import { downloadSourceFile } from '../file-download.js';
import { teamtailorPages, type TeamtailorPageName, type TeamtailorResource } from './schemas.js';

/** https://docs.teamtailor.com/ : "Base" of every example, JSON:API. */
export const TEAMTAILOR_BASE_URL = 'https://api.teamtailor.com/v1';
/** https://docs.teamtailor.com/ (Versioning): "The current version is 20161108", and the header is required. */
export const TEAMTAILOR_API_VERSION = '20161108';
/** https://docs.teamtailor.com/ (Pagination): `page[size]` default 10, max 30. */
export const TEAMTAILOR_PAGE_SIZE = 30;
/** A stuck `links.next` loop must end: 30 per page, so this is 3 million records. */
const MAX_PAGES = 100_000;

export type QueryParams = Readonly<Record<string, string>>;

export interface TeamtailorClient {
  /** Every record of a list endpoint, following `links.next`; `onPage` is told how many each page carried. */
  list<K extends TeamtailorPageName>(path: string, page: K, params?: QueryParams, onPage?: (count: number) => Promise<void>): AsyncGenerator<TeamtailorResource<K>>;
  /**
   * A signed file URL: no API credentials are ever sent to it. On the API host it goes through the allowlisted download;
   * anywhere else (the signed storage URLs of the docs) it is fetched as a public file, from public addresses only.
   */
  download(url: string, store: DownloadStore): Promise<unknown>;
}

const sameOrigin = (a: string, b: string): boolean => new URL(a).origin === new URL(b).origin;

function firstUrl(baseUrl: string, path: string, params: QueryParams): string {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('page[size]', String(TEAMTAILOR_PAGE_SIZE));
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

/**
 * The Teamtailor API on top of the shared reader (GET only, host-limited, throttled). Authentication is the documented
 * `Authorization: Token token=<key>` plus the required `X-Api-Version`.
 */
export function createTeamtailorClient(reader: JsonReader, apiKey: string, baseUrl: string = TEAMTAILOR_BASE_URL): TeamtailorClient {
  const headers = { authorization: `Token token=${apiKey}`, 'x-api-version': TEAMTAILOR_API_VERSION };
  return {
    async *list<K extends TeamtailorPageName>(path: string, page: K, params: QueryParams = {}, onPage?: (count: number) => Promise<void>) {
      let url: string | undefined = firstUrl(baseUrl, path, params);
      const seen = new Set<string>();
      while (url !== undefined) {
        if (seen.has(url) || seen.size >= MAX_PAGES) throw new JsonReaderError('source_invalid_response');
        seen.add(url);
        const response: JsonPage<unknown> = await reader.getJson(url, teamtailorPages[page], { headers });
        const body = response.data as { readonly data: readonly TeamtailorResource<K>[]; readonly links?: { readonly next?: string | null | undefined } | undefined };
        yield* body.data;
        await onPage?.(body.data.length);
        const next = body.links?.next;
        if (next === undefined || next === null || next === '') break;
        if (!sameOrigin(next, baseUrl)) throw new JsonReaderError('source_invalid_response');
        url = next;
      }
    },
    download: (url, store) => downloadSourceFile(reader, url, store, baseUrl),
  };
}
