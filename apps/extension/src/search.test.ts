import { describe, expect, it } from 'vitest';
import type { BrowserApi } from './search.js';
import { runSearch } from './search.js';

const REQUEST = { type: 'candydati.search_linkedin', keywords: ['Go'], location: 'Stockholm', limit: 3 } as const;
const page = (url: string, name: string) => ({ url, title: `${name} | LinkedIn`, heading: name, main: `${name}\nBackend engineer\nStockholm, Sweden\nAbout\nGo` });

/** A fake browser: search pages list profile links; profiles answer with their page; `redirects` sends a URL elsewhere. */
const fakeBrowser = (pages: Record<number, string[]>, redirects: Record<string, string> = {}) => {
  const log: string[] = [];
  let current = '';
  const api: BrowserApi = {
    async open(url) {
      log.push(`open ${url}`);
      current = redirects[url] ?? url;
      return { tabId: 1, url: current };
    },
    async navigate(_tab, url) {
      log.push(`go ${url}`);
      current = redirects[url] ?? url;
      return current;
    },
    async profileHrefs() {
      const pageNumber = Number(new URL(current).searchParams.get('page') ?? '1');
      return pages[pageNumber] ?? [];
    },
    async readPage() {
      const handle = /\/in\/([^/]+)/.exec(current)?.[1] ?? 'x';
      return page(current, `${handle} Lind`);
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

describe('runSearch', () => {
  it('collects profile links page by page up to the limit, reads each profile, and closes the tab', async () => {
    const { api, log } = fakeBrowser({ 1: ['https://www.linkedin.com/in/a/?x=1', 'https://www.linkedin.com/company/acme/', 'https://www.linkedin.com/in/a/'], 2: ['https://www.linkedin.com/in/b/', 'https://www.linkedin.com/in/c/', 'https://www.linkedin.com/in/d/'] });
    const answer = await runSearch(api, REQUEST);
    expect(answer).toMatchObject({ ok: true });
    expect(answer.ok && answer.profiles.map((p) => [p.profileUrl, p.fullName, p.location])).toEqual([
      ['https://www.linkedin.com/in/a/', 'a Lind', 'Stockholm, Sweden'],
      ['https://www.linkedin.com/in/b/', 'b Lind', 'Stockholm, Sweden'],
      ['https://www.linkedin.com/in/c/', 'c Lind', 'Stockholm, Sweden'],
    ]);
    expect(log.at(-1)).toBe('close 1');
  });

  it('stops at the login wall', async () => {
    const search = 'https://www.linkedin.com/search/results/people/?keywords=Go+Stockholm';
    const { api, log } = fakeBrowser({}, { [search]: 'https://www.linkedin.com/login?x=1' });
    expect(await runSearch(api, REQUEST)).toEqual({ ok: false, error: 'not_logged_in' });
    expect(log.at(-1)).toBe('close 1');
  });

  it('hands a security check to the person: the tab stays open and in front', async () => {
    const { api, log } = fakeBrowser({ 1: ['https://www.linkedin.com/in/a/'] }, { 'https://www.linkedin.com/in/a/': 'https://www.linkedin.com/checkpoint/challenge/x' });
    expect(await runSearch(api, REQUEST)).toEqual({ ok: false, error: 'captcha' });
    expect(log.at(-1)).toBe('focus 1');
    expect(log).not.toContain('close 1');
  });

  it('says it was cancelled when the person closes the tab, and that LinkedIn changed when no profile can be read', async () => {
    const { api } = fakeBrowser({ 1: ['https://www.linkedin.com/in/a/'] });
    const closing: BrowserApi = { ...api, navigate: async () => Promise.reject(new Error('No tab with id: 1')) };
    expect(await runSearch(closing, REQUEST)).toEqual({ ok: false, error: 'cancelled' });
    const unreadable: BrowserApi = { ...api, readPage: async () => ({ url: 'https://www.linkedin.com/in/a/', title: 'LinkedIn', heading: null, main: '' }) };
    expect(await runSearch(unreadable, REQUEST)).toEqual({ ok: false, error: 'linkedin_changed' });
  });

  it('gives back an empty list when the search finds nobody', async () => {
    const { api } = fakeBrowser({});
    expect(await runSearch(api, REQUEST)).toEqual({ ok: true, profiles: [] });
  });
});
