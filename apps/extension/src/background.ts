import { z } from 'zod';
import { chromeBrowser } from './chrome-browser.js';
import { isAllowedOrigin } from './linkedin-urls.js';
import { runSearch, type SearchAnswer } from './search.js';
import { chromeWebBrowser } from './chrome-web-browser.js';
import { runWebSearch, webSearchRequestSchema } from './web-search.js';

/** The Candydati origins this build answers, set at build time (`CANDYDATI_ORIGINS`). */
declare const __CANDYDATI_ORIGINS__: readonly string[];

const requestSchema = z
  .object({
    type: z.literal('candydati.search_linkedin'),
    keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
    location: z.string().trim().min(1).max(60).nullable(),
    limit: z.number().int().min(1).max(100),
  })
  .strict();

/** The search a message asks for (LinkedIn or Google), or null for a message of the wrong shape. */
const searchFor = (message: unknown): (() => Promise<unknown>) | null => {
  const linkedin = requestSchema.safeParse(message);
  if (linkedin.success) return () => runSearch(chromeBrowser, linkedin.data);
  const web = webSearchRequestSchema.safeParse(message);
  return web.success ? () => runWebSearch(chromeWebBrowser, web.data) : null;
};

/** One search at a time: a second request while one runs is refused, never queued behind the person's back. */
let running = false;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedOrigin(sender.origin, __CANDYDATI_ORIGINS__)) return undefined;
  const search = searchFor(message);
  if (!search || running) {
    sendResponse({ ok: false, error: 'failed' } satisfies SearchAnswer);
    return undefined;
  }
  running = true;
  void search()
    .then(sendResponse)
    .finally(() => {
      running = false;
    });
  return true;
});
