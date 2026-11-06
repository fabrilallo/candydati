import { describe, expect, it } from 'vitest';
import { runWebSearch, webSearchRequestSchema, type RawGoogleResult, type WebBrowserApi } from './web-search.js';

const REQUEST = { type: 'candydati.search_web', query: 'site:linkedin.com/in "Go" Torino', limit: 3 } as const;
const hit = (n: number): RawGoogleResult => ({ href: `https://www.linkedin.com/in/person-${n}/`, title: `Person${n} Rossi - Go | LinkedIn`, snippet: ` Torino · Go ${n} ` });

/** A fake browser: `pages` lists the raw results by offset (`start`); `redirects` sends a URL elsewhere. */
const fakeBrowser = (pages: Record<number, RawGoogleResult[]>, redirects: Record<string, string> = {}) => {
  const log: string[] = [];
  let current = '';
  const go = (url: string): string => (current = redirects[url] ?? url);
  const api: WebBrowserApi = {
    async open(url) {
      log.push(`open ${url}`);
      return { tabId: 1, url: go(url) };
    },
    async navigate(_tab, url) {
      log.push(`go ${url}`);
      return go(url);
    },
    async results() {
      return pages[Number(new URL(current).searchParams.get('start') ?? '0')] ?? [];
    },
    async focus(tab) {
      log.push(`focus ${tab}`);
    },
    async close(tab) {
      log.push(`close ${tab}`);
    },
  };
  return { api, log };
};

describe('runWebSearch', () => {
  it('reads the results pages up to the limit, keeps links outside Google once, and closes the tab', async () => {
    const google = { href: 'https://maps.google.com/x', title: 'Map', snippet: '' };
    const { api, log } = fakeBrowser({ 0: [hit(1), google, hit(1)], 3: [hit(2), hit(3), hit(4)] });
    const answer = await runWebSearch(api, REQUEST);
    expect(answer).toEqual({
      ok: true,
      results: [1, 2, 3].map((n) => ({ url: `https://www.linkedin.com/in/person-${n}/`, title: `Person${n} Rossi - Go | LinkedIn`, snippet: `Torino · Go ${n}` })),
    });
    expect(log).toEqual(['open https://www.google.com/search?q=site%3Alinkedin.com%2Fin+%22Go%22+Torino&num=3', 'go https://www.google.com/search?q=site%3Alinkedin.com%2Fin+%22Go%22+Torino&num=3&start=3', 'close 1']);
  });

  it('stops when a page brings nothing new, and gives back an empty list when Google finds nothing', async () => {
    const { api } = fakeBrowser({ 0: [hit(1)], 1: [hit(1)] });
    expect(await runWebSearch(api, REQUEST)).toMatchObject({ ok: true, results: [{ url: 'https://www.linkedin.com/in/person-1/' }] });
    expect(await runWebSearch(fakeBrowser({}).api, REQUEST)).toEqual({ ok: true, results: [] });
  });

  it('hands the traffic check and the consent page to the person: the tab stays open and in front', async () => {
    const first = 'https://www.google.com/search?q=site%3Alinkedin.com%2Fin+%22Go%22+Torino&num=3';
    const captcha = fakeBrowser({}, { [first]: 'https://www.google.com/sorry/index?continue=x' });
    expect(await runWebSearch(captcha.api, REQUEST)).toEqual({ ok: false, error: 'captcha' });
    expect(captcha.log.at(-1)).toBe('focus 1');
    const consent = fakeBrowser({ 0: [hit(1)] }, { [`${first}&start=1`]: 'https://consent.google.com/ml?x=1' });
    expect(await runWebSearch(consent.api, REQUEST)).toEqual({ ok: false, error: 'consent_required' });
    expect(consent.log).not.toContain('close 1');
  });

  it('says it was cancelled when the person closes the tab, failed on anything else', async () => {
    const { api, log } = fakeBrowser({ 0: [hit(1)] });
    expect(await runWebSearch({ ...api, navigate: async () => Promise.reject(new Error('No tab with id: 1')) }, REQUEST)).toEqual({ ok: false, error: 'cancelled' });
    expect(await runWebSearch({ ...api, results: async () => Promise.reject(new Error('boom')) }, REQUEST)).toEqual({ ok: false, error: 'failed' });
    expect(log.at(-1)).toBe('close 1');
    expect(await runWebSearch({ ...api, open: async () => Promise.reject(new Error('boom')) }, REQUEST)).toEqual({ ok: false, error: 'failed' });
  });

  it('accepts only a well-formed request', () => {
    expect(webSearchRequestSchema.safeParse(REQUEST).success).toBe(true);
    expect(webSearchRequestSchema.safeParse({ ...REQUEST, limit: 31 }).success).toBe(false);
    expect(webSearchRequestSchema.safeParse({ ...REQUEST, query: ' ' }).success).toBe(false);
    expect(webSearchRequestSchema.safeParse({ ...REQUEST, extra: 1 }).success).toBe(false);
  });
});
