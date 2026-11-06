import { MAX_WEB_RESULTS, WEB_QUERY_MAX, type WebResult } from '@candydati/domain';
import { z } from 'zod';
import { classifyGooglePage, googleSearchUrl, resultLink, type GooglePageState } from './google-urls.js';

export const webSearchRequestSchema = z
  .object({
    type: z.literal('candydati.search_web'),
    query: z.string().trim().min(1).max(WEB_QUERY_MAX),
    limit: z.number().int().min(1).max(MAX_WEB_RESULTS),
  })
  .strict();
export type WebSearchRequest = z.output<typeof webSearchRequestSchema>;

export type WebSearchError = 'captcha' | 'consent_required' | 'cancelled' | 'failed';
export type WebSearchAnswer = { readonly ok: true; readonly results: readonly WebResult[] } | { readonly ok: false; readonly error: WebSearchError };

/** One result as the page script read it, before its link is checked. */
export interface RawGoogleResult {
  readonly href: string;
  readonly title: string;
  readonly snippet: string;
}

/** The few browser actions a web search needs (`chrome-web-browser.ts` in the extension, a fake in tests). */
export interface WebBrowserApi {
  /** Opens a tab in the visible "Candydati" group, without taking the focus; resolves with where it landed. */
  open(url: string): Promise<{ readonly tabId: number; readonly url: string }>;
  /** Goes to `url` in the tab and waits for the page; resolves with where it landed. */
  navigate(tabId: number, url: string): Promise<string>;
  /** The organic results of the page in the tab. */
  results(tabId: number): Promise<readonly RawGoogleResult[]>;
  /** Brings the tab to the person: a check only they can pass. */
  focus(tabId: number): Promise<void>;
  close(tabId: number): Promise<void>;
}

const TITLE_MAX = 300;
const SNIPPET_MAX = 1000;
/** Pages read at most: Google lists about 10 results a page, whatever `num` asks. */
const pagesFor = (limit: number): number => Math.ceil(limit / 10) + 1;

class Stop extends Error {
  constructor(readonly reason: WebSearchError) {
    super(reason);
  }
}

const check = (url: string): void => {
  const state: GooglePageState = classifyGooglePage(url);
  if (state !== 'ok') throw new Stop(state);
};

/** The results of one page that point outside Google, with a title, not seen before. */
function usable(raw: readonly RawGoogleResult[], seen: Set<string>): WebResult[] {
  return raw.flatMap((item) => {
    const url = resultLink(item.href);
    const title = item.title.trim().slice(0, TITLE_MAX);
    if (!url || url.length > 500 || title === '' || seen.has(url)) return [];
    seen.add(url);
    return [{ url, title, snippet: item.snippet.trim().slice(0, SNIPPET_MAX) }];
  });
}

async function collect(api: WebBrowserApi, tabId: number, request: WebSearchRequest): Promise<readonly WebResult[]> {
  const seen = new Set<string>();
  const results: WebResult[] = [];
  let offset = 0;
  for (let page = 1; page <= pagesFor(request.limit) && results.length < request.limit; page += 1) {
    if (page > 1) check(await api.navigate(tabId, googleSearchUrl(request.query, request.limit, offset)));
    const raw = await api.results(tabId);
    const fresh = usable(raw, seen);
    if (raw.length === 0 || fresh.length === 0) break;
    offset += raw.length;
    results.push(...fresh.slice(0, request.limit - results.length));
  }
  return results;
}

/**
 * One Google search, in a visible tab of the person's own browser: the results pages, up to `limit` organic results
 * (title, link, snippet), never the pages behind them. Google's traffic check and its consent page stop the search and
 * the tab stays in front: only the person may answer them, nothing is bypassed. Closing the tab cancels.
 */
export async function runWebSearch(api: WebBrowserApi, request: WebSearchRequest): Promise<WebSearchAnswer> {
  let tabId: number | null = null;
  try {
    const opened = await api.open(googleSearchUrl(request.query, request.limit, 0));
    tabId = opened.tabId;
    check(opened.url);
    const results = await collect(api, tabId, request);
    await api.close(tabId).catch(() => undefined);
    return { ok: true, results };
  } catch (error) {
    const reason: WebSearchError = error instanceof Stop ? error.reason : /no tab with id/i.test(String((error as Error).message)) ? 'cancelled' : 'failed';
    if (tabId !== null && (reason === 'captcha' || reason === 'consent_required')) await api.focus(tabId).catch(() => undefined);
    else if (tabId !== null) await api.close(tabId).catch(() => undefined);
    return { ok: false, error: reason };
  }
}
