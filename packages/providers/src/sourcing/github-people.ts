import { z } from 'zod';

/** A public GitHub account, as the API gives it, minus what sourcing must not keep (email, followers). */
export interface GithubPerson {
  readonly login: string;
  readonly name: string | null;
  readonly location: string | null;
  readonly bio: string | null;
  readonly profileUrl: string;
  readonly publicRepos: number;
  readonly languages: readonly { readonly language: string; readonly repos: number }[];
}

export interface GithubQuery {
  readonly languages: readonly string[];
  readonly location: string | null;
  readonly keywords: readonly string[];
  readonly limit: number;
}

export type GithubSearchReason = 'rate_limited' | 'unavailable';

export class GithubSearchError extends Error {
  constructor(readonly reason: GithubSearchReason) {
    super(`GitHub search failed: ${reason}`);
    this.name = 'GithubSearchError';
  }
}

export interface GithubPeopleSearchOptions {
  /** A token raises GitHub's limits (5,000 calls an hour instead of 60); read-only public data needs no scope. */
  readonly token: string | null;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const API = 'https://api.github.com';
const searchSchema = z.object({ items: z.array(z.object({ login: z.string(), type: z.string() })) });
const userSchema = z.object({ login: z.string(), name: z.string().nullable(), location: z.string().nullable(), bio: z.string().nullable(), html_url: z.string(), public_repos: z.number() });
const reposSchema = z.array(z.object({ language: z.string().nullable(), fork: z.boolean() }));

/** A value inside quotes, with the quotes it carried removed: it can never close the quote and add a qualifier. */
const quoted = (value: string): string => `"${value.replace(/["\\]/g, '').trim()}"`;

export const githubQuery = (query: GithubQuery): string =>
  [...query.languages.map((language) => `language:${quoted(language)}`), ...(query.location ? [`location:${quoted(query.location)}`] : []), ...query.keywords.map((word) => `${quoted(word)} in:bio`), 'type:user'].join(' ');

/** Languages of the person's own repositories (forks left out), most repositories first. */
const languagesOf = (repos: z.output<typeof reposSchema>): GithubPerson['languages'] => {
  const counts = new Map<string, number>();
  for (const repo of repos) if (!repo.fork && repo.language) counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  return [...counts].map(([language, count]) => ({ language, repos: count })).toSorted((a, b) => b.repos - a.repos || a.language.localeCompare(b.language));
};

/**
 * GitHub's official REST API, public data only: user search (sorted by join date, never "best match"), then each
 * person's profile and own repositories. No email, no followers.
 */
export function createGithubPeopleSearch(options: GithubPeopleSearchOptions) {
  const doFetch = options.fetch ?? fetch;
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'candydati-sourcing', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) };
  const get = async <S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> => {
    let response: Response;
    try {
      response = await doFetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
    } catch {
      throw new GithubSearchError('unavailable');
    }
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new GithubSearchError('rate_limited');
    if (!response.ok) throw new GithubSearchError('unavailable');
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new GithubSearchError('unavailable');
    return parsed.data;
  };
  const person = async (login: string): Promise<GithubPerson> => {
    const user = await get(`/users/${encodeURIComponent(login)}`, userSchema);
    const repos = await get(`/users/${encodeURIComponent(login)}/repos?per_page=100&type=owner&sort=pushed`, reposSchema);
    return { login: user.login, name: user.name, location: user.location, bio: user.bio, profileUrl: user.html_url, publicRepos: user.public_repos, languages: languagesOf(repos) };
  };
  return {
    async search(query: GithubQuery): Promise<readonly GithubPerson[]> {
      const params = new URLSearchParams({ q: githubQuery(query), sort: 'joined', order: 'desc', per_page: String(query.limit) });
      const found = await get(`/search/users?${params.toString()}`, searchSchema);
      const people: GithubPerson[] = [];
      for (const item of found.items.filter((entry) => entry.type === 'User').slice(0, query.limit)) people.push(await person(item.login));
      return people;
    },
  };
}
