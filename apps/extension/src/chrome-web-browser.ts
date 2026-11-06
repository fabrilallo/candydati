import { chromeBrowser, loaded, openInGroup, run } from './chrome-browser.js';
import { readGoogleResults } from './google-page-scripts.js';
import type { WebBrowserApi } from './web-search.js';

/**
 * The browser actions of a web search, on the person's own Chrome: the same visible "Candydati" tab as a LinkedIn
 * search. Google renders its results on the server, so the page is read as soon as it loaded.
 */
export const chromeWebBrowser: WebBrowserApi = {
  open: openInGroup,
  async navigate(tabId, url) {
    const pending = loaded(tabId);
    await chrome.tabs.update(tabId, { url });
    return pending;
  },
  async results(tabId) {
    return (await run(tabId, readGoogleResults)) ?? [];
  },
  focus: (tabId) => chromeBrowser.focus(tabId),
  close: (tabId) => chromeBrowser.close(tabId),
};
