import type { LinkedinProfile } from '@candydati/domain';
import { classifyPage, profileLink, searchUrl } from './linkedin-urls.js';
import { parseProfile, type RawProfilePage } from './profile-parse.js';

export interface SearchRequest {
  readonly type: 'candydati.search_linkedin';
  readonly keywords: readonly string[];
  readonly location: string | null;
  readonly limit: number;
}

export type SearchError = 'not_logged_in' | 'captcha' | 'cancelled' | 'linkedin_changed' | 'failed';
export type SearchAnswer = { readonly ok: true; readonly profiles: readonly LinkedinProfile[] } | { readonly ok: false; readonly error: SearchError };

/** The few browser actions a search needs (`chrome-browser.ts` in the extension, a fake in tests). */
export interface BrowserApi {
  /** Opens a tab in the visible "Candydati" group, without taking the focus; resolves with where it landed. */
  open(url: string): Promise<{ readonly tabId: number; readonly url: string }>;
  /** Goes to `url` in the tab and waits for the page; resolves with where it landed (LinkedIn may redirect). */
  navigate(tabId: number, url: string): Promise<string>;
  /** The links of the people listed on a search page. */
  profileHrefs(tabId: number): Promise<readonly string[]>;
  /** Name, title and visible text of the profile page. */
  readPage(tabId: number): Promise<RawProfilePage>;
  /** Brings the tab to the person: a check only they can pass. */
  focus(tabId: number): Promise<void>;
  close(tabId: number): Promise<void>;
}

/** Search pages read at most: LinkedIn lists 10 people a page. */
const pagesFor = (limit: number): number => Math.ceil(limit / 10) + 1;

class Stop extends Error {
  constructor(readonly reason: SearchError) {
    super(reason);
  }
}

const check = (url: string): void => {
  const state = classifyPage(url);
  if (state !== 'ok') throw new Stop(state);
};

async function collectLinks(api: BrowserApi, tabId: number, request: SearchRequest): Promise<readonly string[]> {
  const links = new Set<string>();
  for (let page = 1; page <= pagesFor(request.limit) && links.size < request.limit; page += 1) {
    if (page > 1) check(await api.navigate(tabId, searchUrl(request.keywords, request.location, page)));
    const found = (await api.profileHrefs(tabId)).flatMap((href) => profileLink(href) ?? []);
    if (found.length === 0) break;
    for (const link of found) if (links.size < request.limit) links.add(link);
  }
  return [...links];
}

async function readProfiles(api: BrowserApi, tabId: number, links: readonly string[]): Promise<readonly LinkedinProfile[]> {
  const profiles: LinkedinProfile[] = [];
  for (const link of links) {
    check(await api.navigate(tabId, link));
    const profile = parseProfile({ ...(await api.readPage(tabId)), url: link });
    if (profile) profiles.push(profile);
  }
  if (links.length > 0 && profiles.length === 0) throw new Stop('linkedin_changed');
  return profiles;
}

/**
 * One search, in a visible tab of the person's own browser: LinkedIn people search, then each profile, up to `limit`.
 * Stops at the login wall and at a security check (the tab stays in front: only the person may pass it). Closing the
 * tab cancels. No throttling beyond the person's limit, no automation of LinkedIn actions: reading only.
 */
export async function runSearch(api: BrowserApi, request: SearchRequest): Promise<SearchAnswer> {
  let tabId: number | null = null;
  try {
    const opened = await api.open(searchUrl(request.keywords, request.location, 1));
    tabId = opened.tabId;
    check(opened.url);
    const profiles = await readProfiles(api, tabId, await collectLinks(api, tabId, request));
    await api.close(tabId).catch(() => undefined);
    return { ok: true, profiles };
  } catch (error) {
    const reason: SearchError = error instanceof Stop ? error.reason : /no tab with id/i.test(String((error as Error).message)) ? 'cancelled' : 'failed';
    if (tabId !== null && reason === 'captcha') await api.focus(tabId).catch(() => undefined);
    else if (tabId !== null) await api.close(tabId).catch(() => undefined);
    return { ok: false, error: reason };
  }
}
