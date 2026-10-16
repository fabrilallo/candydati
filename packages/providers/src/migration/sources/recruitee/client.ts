import type { z } from 'zod';
import type { JsonReader, DownloadStore } from '../../../http/index.js';
import { JsonReaderError } from '../../../http/index.js';
import {
  candidateDetailSchema,
  hitSchema,
  noteSchema,
  notesSchema,
  offerDetailSchema,
  offerSchema,
  offersPageSchema,
  searchPageSchema,
  type RecruiteeHit,
  type RecruiteeNote,
  type RecruiteeOffer,
} from './schemas.js';

export const RECRUITEE_API = 'https://api.recruitee.com';
/** Recruitee documents up to 10,000 per call; a smaller page keeps each answer well under the reader's body cap. */
export const SEARCH_PAGE_SIZE = 100;
const MAX_PAGES = 5000;
/** Consecutive 404s after which an optional endpoint is considered absent on this account. */
const MISSING_LIMIT = 5;

export type OptionalEndpoint = 'offers' | 'offer_detail' | 'candidate_detail' | 'notes';
export type RecruiteeCandidateDetail = NonNullable<ReturnType<typeof candidateDetailSchema.parse>['candidate']>;

export interface SearchPage {
  readonly hits: readonly RecruiteeHit[];
  /** Records of the page that did not have the expected shape (skipped). */
  readonly invalid: number;
  readonly total: number | null;
}

export interface RecruiteeClientOptions {
  readonly baseUrl: string;
  readonly company: string;
  readonly token: string;
  readonly reader: JsonReader;
  /** Called with the endpoint only (never a URL, id or body) when an optional endpoint answered 401/403/404 or oddly. */
  readonly onSkip?: ((endpoint: OptionalEndpoint, status: number | null) => void) | undefined;
}

export interface RecruiteeClient {
  searchPages(): AsyncGenerator<SearchPage>;
  offers(): Promise<readonly RecruiteeOffer[] | null>;
  offerDetail(offerId: string): Promise<RecruiteeOffer | null>;
  candidateDetail(candidateId: string): Promise<RecruiteeCandidateDetail | null>;
  notes(candidateId: string): Promise<readonly RecruiteeNote[] | null>;
  download(url: string, store: DownloadStore): Promise<unknown>;
}

function parseAll<T>(items: readonly unknown[], parse: (item: unknown) => T | null): { readonly ok: readonly T[]; readonly invalid: number } {
  const ok = items.flatMap((item) => {
    const parsed = parse(item);
    return parsed === null ? [] : [parsed];
  });
  return { ok, invalid: items.length - ok.length };
}

type Optional = <T>(endpoint: OptionalEndpoint, read: () => Promise<T>) => Promise<T | null>;

/** Optional endpoints: 401/403 switch one off for the run, 404 skips that call (and switches it off after a few), odd shapes skip. */
function createOptional(onSkip: RecruiteeClientOptions['onSkip']): Optional {
  const disabled = new Set<OptionalEndpoint>();
  const missing = new Map<OptionalEndpoint, number>();
  return async (endpoint, read) => {
    if (disabled.has(endpoint)) return null;
    try {
      const value = await read();
      missing.set(endpoint, 0);
      return value;
    } catch (error) {
      if (!(error instanceof JsonReaderError)) throw error;
      if (error.code === 'credentials_refused') disabled.add(endpoint);
      else if (error.code === 'not_found') {
        const count = (missing.get(endpoint) ?? 0) + 1;
        missing.set(endpoint, count);
        if (count >= MISSING_LIMIT) disabled.add(endpoint);
      } else if (error.code !== 'source_invalid_response') throw error;
      onSkip?.(endpoint, error.status ?? null);
      return null;
    }
  };
}

const safe = <T>(schema: z.ZodType<T>) => (item: unknown): T | null => {
  const result = schema.safeParse(item);
  return result.success ? result.data : null;
};

/** The Recruitee endpoints the connector reads, with auth, Zod validation and the skip rules of optional ones. */
export function createRecruiteeClient(options: RecruiteeClientOptions): RecruiteeClient {
  const root = `${options.baseUrl}/c/${encodeURIComponent(options.company)}`;
  const extras = { headers: { authorization: `Bearer ${options.token}` } };
  const optional = createOptional(options.onSkip);
  const get = <S extends z.ZodType>(path: string, schema: S) => options.reader.getJson(`${root}${path}`, schema, extras);
  const listOffers = (scope: string) =>
    optional('offers', async () => parseAll((await get(`/offers${scope}`, offersPageSchema)).data.offers ?? [], safe(offerSchema)).ok);

  async function* searchPages(): AsyncGenerator<SearchPage> {
    let seen = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data } = await get(`/search/new/candidates?limit=${SEARCH_PAGE_SIZE}&page=${page}&sort_by=created_at_asc`, searchPageSchema);
      const parsed = parseAll(data.hits, safe(hitSchema));
      seen += data.hits.length;
      const total = data.total ?? null;
      yield { hits: parsed.ok, invalid: parsed.invalid, total };
      if (data.hits.length < SEARCH_PAGE_SIZE || (total !== null && seen >= total)) return;
    }
  }

  return {
    searchPages,
    async offers() {
      const lists = await Promise.all([listOffers(''), listOffers('?scope=archived')]);
      return lists.every((list) => list === null) ? null : lists.flatMap((list) => list ?? []);
    },
    offerDetail: (id) => optional('offer_detail', async () => (await get(`/offers/${encodeURIComponent(id)}`, offerDetailSchema)).data.offer ?? null),
    candidateDetail: (id) => optional('candidate_detail', async () => (await get(`/candidates/${encodeURIComponent(id)}`, candidateDetailSchema)).data.candidate ?? null),
    notes: (id) => optional('notes', async () => parseAll((await get(`/candidates/${encodeURIComponent(id)}/notes`, notesSchema)).data, safe(noteSchema)).ok),
    download: (url, store) => options.reader.download(url, store, extras),
  };
}
