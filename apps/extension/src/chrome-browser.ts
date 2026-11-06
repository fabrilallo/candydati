import { collectProfileHrefs, readProfilePage, waitForMain } from './page-scripts.js';
import type { BrowserApi } from './search.js';

const GROUP_TITLE = 'Candydati';
/** Longest wait for one page to load before giving up on the search. */
const LOAD_TIMEOUT_MS = 45_000;

/**
 * Resolves with the tab's address once it finished loading; rejects when the tab is gone or the load never ends. With
 * `alreadyDone`, a tab that finished before the listener was in place (a fast page) resolves at once too.
 */
function loaded(tabId: number, alreadyDone = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('load timeout'));
    }, LOAD_TIMEOUT_MS);
    const listener = (id: number, change: { status?: string }, tab: chrome.tabs.Tab): void => {
      if (id !== tabId || change.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab.url ?? '');
    };
    chrome.tabs.onUpdated.addListener(listener);
    if (alreadyDone) {
      void chrome.tabs.get(tabId).then((tab) => {
        if (tab.status !== 'complete') return;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab.url ?? '');
      }, reject);
    }
  });
}

async function run<R>(tabId: number, func: () => R | Promise<R>): Promise<Awaited<R> | undefined> {
  const [first] = await chrome.scripting.executeScript({ target: { tabId }, func });
  return first?.result;
}

/** The browser actions of a search, on the person's own Chrome: one tab, in a visible group named "Candydati". */
export const chromeBrowser: BrowserApi = {
  async open(url) {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) throw new Error('No tab with id');
    const group = await chrome.tabs.group({ tabIds: tab.id });
    await chrome.tabGroups.update(group, { title: GROUP_TITLE, color: 'yellow' });
    // Grouping takes a moment: the page may finish loading meanwhile, so the wait also asks the tab where it stands.
    const landed = await loaded(tab.id, true);
    await run(tab.id, waitForMain);
    return { tabId: tab.id, url: landed };
  },
  async navigate(tabId, url) {
    const pending = loaded(tabId);
    await chrome.tabs.update(tabId, { url });
    const landed = await pending;
    await run(tabId, waitForMain);
    return landed;
  },
  async profileHrefs(tabId) {
    return (await run(tabId, collectProfileHrefs)) ?? [];
  },
  async readPage(tabId) {
    return (await run(tabId, readProfilePage)) ?? { url: '', title: '', heading: null, main: '' };
  },
  async focus(tabId) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  },
  async close(tabId) {
    await chrome.tabs.remove(tabId);
  },
};
