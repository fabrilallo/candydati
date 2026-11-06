import { describe, expect, it } from 'vitest';
import { createGithubPeopleSearch, GithubSearchError } from './github-people.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const user = (login: string) => ({ login, name: `${login} Surname`, location: 'Stockholm', bio: 'Go developer', html_url: `https://github.com/${login}`, public_repos: 4, type: 'User', email: 'hidden@example.com', followers: 999 });
const repos = [
  { language: 'Go', fork: false },
  { language: 'Go', fork: false },
  { language: 'Python', fork: false },
  { language: 'Go', fork: true },
  { language: null, fork: false },
];

const fakeFetch = (calls: string[], overrides: Record<string, Response> = {}) => async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${url} ${new Headers(init?.headers).get('authorization') ?? 'anonymous'}`);
  if (overrides[url]) return overrides[url];
  if (url.startsWith('https://api.github.com/search/users')) return json({ items: [{ login: 'maja', type: 'User' }, { login: 'acme-org', type: 'Organization' }] });
  if (url === 'https://api.github.com/users/maja') return json(user('maja'));
  if (url.startsWith('https://api.github.com/users/maja/repos')) return json(repos);
  return json({ message: 'not found' }, 404);
};

describe('GitHub people search', () => {
  it('searches users on languages, location and bio words, newest accounts first, and reads their own repositories', async () => {
    const calls: string[] = [];
    const search = createGithubPeopleSearch({ token: 'ghp_test', fetch: fakeFetch(calls) });
    const people = await search.search({ languages: ['Go'], location: 'Stockholm', keywords: ['Kubernetes'], limit: 5 });
    const query = new URL(calls[0]!.split(' ')[0]!);
    expect(query.searchParams.get('q')).toBe('language:"Go" location:"Stockholm" "Kubernetes" in:bio type:user');
    expect(query.searchParams.get('sort')).toBe('joined');
    expect(query.searchParams.get('per_page')).toBe('5');
    expect(calls.every((call) => call.endsWith('Bearer ghp_test'))).toBe(true);
    expect(people).toEqual([
      { login: 'maja', name: 'maja Surname', location: 'Stockholm', bio: 'Go developer', profileUrl: 'https://github.com/maja', publicRepos: 4, languages: [{ language: 'Go', repos: 2 }, { language: 'Python', repos: 1 }] },
    ]);
    expect(JSON.stringify(people)).not.toContain('hidden@example.com');
    expect(JSON.stringify(people)).not.toContain('999');
  });

  it('works without a token, and says so when GitHub limits the calls', async () => {
    const calls: string[] = [];
    const limited = json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' });
    const search = createGithubPeopleSearch({ fetch: fakeFetch(calls, {}), token: null });
    await search.search({ languages: ['Go'], location: null, keywords: [], limit: 1 });
    expect(calls[0]).toMatch(/anonymous$/);
    const blocked = createGithubPeopleSearch({ token: null, fetch: async () => limited.clone() });
    await expect(blocked.search({ languages: ['Go'], location: null, keywords: [], limit: 1 })).rejects.toMatchObject({ reason: 'rate_limited' });
    await expect(createGithubPeopleSearch({ token: null, fetch: async () => json({}, 500) }).search({ languages: ['Go'], location: null, keywords: [], limit: 1 })).rejects.toBeInstanceOf(GithubSearchError);
  });

  it('quotes what it is given, so a criterion cannot add qualifiers of its own', async () => {
    const calls: string[] = [];
    await createGithubPeopleSearch({ token: null, fetch: fakeFetch(calls) }).search({ languages: ['Go" user:admin'], location: null, keywords: [], limit: 1 });
    expect(new URL(calls[0]!.split(' ')[0]!).searchParams.get('q')).toBe('language:"Go user:admin" type:user');
  });
});
