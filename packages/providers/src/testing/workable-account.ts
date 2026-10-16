import { workableFixture, type WorkableReply, type WorkableRoute } from './workable-harness.js';

/**
 * TEST ONLY. A small Workable account made of the docs' example responses (`fixtures/migration/workable/`), with the few
 * changes each test needs written next to it. Candidate `108d1748` is the docs' example candidate, `ce4da98` the docs'
 * listed candidate, shown with the same detail shape.
 */
type Json = Record<string, unknown>;
type Candidate = Json & { id: string };

const ok = (body: unknown): WorkableReply => ({ body });

export interface AccountOptions {
  /** Replaces what `GET /candidates/{id}` returns for a candidate. */
  readonly candidates?: Readonly<Record<string, Candidate | WorkableReply>>;
  readonly activities?: Readonly<Record<string, readonly Json[]>>;
  readonly extraListed?: readonly string[];
  readonly files?: Readonly<Record<string, WorkableReply>>;
}

export function exampleCandidate(overrides: Json): Candidate {
  const { candidate } = workableFixture<{ candidate: Json }>('candidate-show');
  return { ...candidate, ...overrides } as Candidate;
}

export const exampleActivities = (): Json[] => workableFixture<{ activities: Json[] }>('activities').activities;

export function workableAccount(options: AccountOptions): WorkableRoute {
  const jobs = workableFixture<{ jobs: Json[] }>('jobs').jobs;
  const listed = workableFixture<{ candidates: Json[] }>('candidates-list').candidates.map((c) => ({ id: c.id }));
  const detail = (id: string): WorkableReply => {
    const given = options.candidates?.[id];
    if (given === undefined) return { status: 404, body: { error: 'Not found' } };
    return 'id' in given ? ok({ candidate: given }) : (given as WorkableReply);
  };
  return (url) => {
    const q = url.searchParams;
    const path = url.pathname.replace('/spi/v3', '');
    if (path === '/members') return ok(workableFixture('members'));
    if (path === '/stages') return ok(workableFixture('stages'));
    if (path === '/jobs') {
      const state = q.get('state');
      if (state === 'draft') return q.has('since_id') ? ok({ jobs: [jobs[1]] }) : ok({ jobs: [jobs[0]], paging: { next: `https://www.workable.com/spi/v3/accounts/groove-tech/jobs?limit=100&since_id=1166bf8c` } });
      return ok({ jobs: state === 'published' ? [jobs[2]] : [] });
    }
    if (path === '/candidates') {
      if (q.get('shortcode') !== 'GROOV005') return ok({ candidates: [] });
      if (q.has('since_id')) return ok({ candidates: (options.extraListed ?? []).map((id) => ({ id })) });
      return ok({ candidates: listed, paging: { next: 'https://www.workable.com/spi/v3/accounts/groove-tech/candidates?limit=100&since_id=2789d6dg' } });
    }
    const activities = /^\/candidates\/([^/]+)\/activities$/.exec(path);
    if (activities?.[1] !== undefined) return ok({ activities: options.activities?.[activities[1]] ?? [] });
    const one = /^\/candidates\/([^/]+)$/.exec(path);
    if (one?.[1] !== undefined) return detail(decodeURIComponent(one[1]));
    return options.files?.[path];
  };
}
