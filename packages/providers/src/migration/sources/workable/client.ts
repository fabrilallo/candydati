import { z } from 'zod';
import { JsonReaderError, type DownloadResult, type DownloadStore, type JsonReader } from '../../../http/index.js';

/**
 * Workable SPI v3 reads, one Zod schema per page (https://workable.readme.io/reference). Every schema lists only the
 * fields the connector uses: Zod drops the rest while parsing, so ratings, photos, education, experience and every other
 * field the package refuses never leave this file. Fields the docs show as optional are `nullish`, and the ones whose
 * shape the docs do not pin down are `catch`ed to null instead of failing the whole page.
 */
const PAGE_LIMIT = 100;
/** A loop guard: 5,000 pages of 100 is far beyond what an account can hold. */
const MAX_PAGES = 5_000;

const str = z.string().nullish();
const loose = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null);

export const memberSchema = z.object({ id: z.string(), name: str, email: str });
export const stageSchema = z.object({ slug: z.string(), name: z.string(), kind: str, position: z.number().nullish() });
export const jobSchema = z.object({ shortcode: z.string(), title: z.string(), state: str, created_at: str });
const refSchema = z.object({ id: z.union([z.string(), z.number()]).nullish(), name: str });
const answerSchema = z.object({
  question: z.object({ body: str }).nullish(),
  answer: z.object({ body: str, choices: z.array(z.object({ body: str })).nullish(), checked: z.boolean().nullish() }).nullish(),
});
export const candidateSchema = z.object({
  id: z.string(),
  name: str,
  firstname: str,
  lastname: str,
  email: str,
  phone: str,
  stage: str,
  stage_kind: str,
  disqualified: z.boolean().nullish(),
  withdrew: z.boolean().nullish(),
  disqualified_at: str,
  disqualification_reason: str,
  sourced: z.boolean().nullish(),
  domain: str,
  created_at: str,
  updated_at: str,
  hired_at: str,
  cover_letter: str,
  resume_url: str,
  resume_metadata: z.object({ filename: str }).nullish(),
  tags: loose(z.array(z.string())),
  answers: loose(z.array(answerSchema)),
  social_profiles: loose(z.array(z.object({ type: str, url: str }))),
});
export const activitySchema = z.object({
  action: z.string(),
  stage_name: str,
  target_stage: loose(refSchema),
  created_at: str,
  member: loose(z.object({ id: z.string().nullish(), name: str })),
  body: z.string().nullish().catch(null),
});

export type WorkableMember = z.output<typeof memberSchema>;
export type WorkableStage = z.output<typeof stageSchema>;
export type WorkableJob = z.output<typeof jobSchema>;
export type WorkableCandidate = z.output<typeof candidateSchema>;
export type WorkableActivity = z.output<typeof activitySchema>;
export type WorkableJobState = 'draft' | 'published' | 'archived' | 'closed';
export const JOB_STATES: readonly WorkableJobState[] = ['draft', 'published', 'archived', 'closed'];

const paging = z.object({ next: str }).nullish().catch(null);
const membersPage = z.object({ members: z.array(memberSchema), paging });
const stagesPage = z.object({ stages: z.array(stageSchema) });
const jobsPage = z.object({ jobs: z.array(jobSchema), paging });
const candidatesPage = z.object({ candidates: z.array(z.object({ id: z.string() })), paging });
const candidatePage = z.object({ candidate: candidateSchema });
const activitiesPage = z.object({ activities: z.array(activitySchema), paging });

/** The `since_id` the next page starts at. We never follow `paging.next` itself: its host and path differ from the API's. */
function nextSinceId(next: string | null | undefined): string | null {
  if (next === null || next === undefined) return null;
  try {
    return new URL(next).searchParams.get('since_id');
  } catch {
    return null;
  }
}

export interface WorkableClient {
  members(): AsyncIterable<WorkableMember>;
  stages(): Promise<readonly WorkableStage[]>;
  jobs(state: WorkableJobState): AsyncIterable<WorkableJob>;
  candidateIds(shortcode: string): AsyncIterable<string>;
  candidate(id: string): Promise<WorkableCandidate>;
  activities(candidateId: string): AsyncIterable<WorkableActivity>;
  download(url: string, store: DownloadStore): Promise<DownloadResult>;
}

/** Account subdomain: one DNS label, so the host can only ever be `{label}.workable.com`. */
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type Query = Readonly<Record<string, string>>;
interface Chunk<T> {
  readonly items: readonly T[];
  readonly next: string | null | undefined;
}

/** Every item of a `since_id` paginated list, oldest first, `PAGE_LIMIT` per request. */
async function* paginate<T>(query: Query, read: (query: Query) => Promise<Chunk<T>>): AsyncGenerator<T> {
  const seen = new Set<string>();
  let sinceId: string | null = null;
  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const { items, next } = await read({ limit: String(PAGE_LIMIT), ...query, ...(sinceId === null ? {} : { since_id: sinceId }) });
    yield* items;
    sinceId = nextSinceId(next);
    if (sinceId === null) return;
    if (seen.has(sinceId)) throw new JsonReaderError('source_invalid_response');
    seen.add(sinceId);
  }
  throw new JsonReaderError('source_invalid_response');
}

async function* idsOf(source: AsyncIterable<{ id: string }>): AsyncGenerator<string> {
  for await (const item of source) yield item.id;
}

/** A client for `baseUrl` (`https://{subdomain}.workable.com/spi/v3`) with the account's bearer token. */
export function createWorkableClient(reader: JsonReader, baseUrl: string, token: string): WorkableClient {
  const extras = { headers: { authorization: `Bearer ${token}` } };
  const get = async <S extends z.ZodType>(path: string, query: Query, schema: S): Promise<z.output<S>> => {
    const search = new URLSearchParams(query).toString();
    return (await reader.getJson(`${baseUrl}${path}${search === '' ? '' : `?${search}`}`, schema, extras)).data;
  };
  const candidates = (shortcode: string) =>
    paginate({ shortcode }, async (q) => {
      const data = await get('/candidates', q, candidatesPage);
      return { items: data.candidates, next: data.paging?.next };
    });
  return {
    members: () =>
      paginate({ status: 'all' }, async (q) => {
        const data = await get('/members', q, membersPage);
        return { items: data.members, next: data.paging?.next };
      }),
    stages: async () => (await get('/stages', {}, stagesPage)).stages,
    jobs: (state) =>
      paginate({ state }, async (q) => {
        const data = await get('/jobs', q, jobsPage);
        return { items: data.jobs, next: data.paging?.next };
      }),
    candidateIds: (shortcode) => idsOf(candidates(shortcode)),
    candidate: async (id) => (await get(`/candidates/${encodeURIComponent(id)}`, {}, candidatePage)).candidate,
    activities: (id) =>
      paginate({}, async (q) => {
        const data = await get(`/candidates/${encodeURIComponent(id)}/activities`, q, activitiesPage);
        return { items: data.activities, next: data.paging?.next };
      }),
    download: (url, store) => reader.download(url, store, extras),
  };
}
