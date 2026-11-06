import { z } from 'zod';
import { chromeBrowser } from './chrome-browser.js';
import { isAllowedOrigin } from './linkedin-urls.js';
import { runSearch, type SearchAnswer } from './search.js';

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

/** One search at a time: a second request while one runs is refused, never queued behind the person's back. */
let running = false;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedOrigin(sender.origin, __CANDYDATI_ORIGINS__)) return undefined;
  const request = requestSchema.safeParse(message);
  if (!request.success || running) {
    sendResponse({ ok: false, error: 'failed' } satisfies SearchAnswer);
    return undefined;
  }
  running = true;
  void runSearch(chromeBrowser, request.data)
    .then(sendResponse)
    .finally(() => {
      running = false;
    });
  return true;
});
