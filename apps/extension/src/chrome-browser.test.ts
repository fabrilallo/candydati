import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (tabId: number, change: { status?: string }, tab: { url?: string; windowId: number }) => void;

/** A fake of the Chrome APIs the browser adapter uses: every navigation "loads" right away at `landing[url] ?? url`. */
const fakeChrome = (landing: Record<string, string> = {}, scriptResult: unknown = undefined) => {
  const listeners = new Set<Listener>();
  let landed = '';
  const calls: string[] = [];
  const load = (tabId: number, url: string) => ((landed = landing[url] ?? url), queueMicrotask(() => listeners.forEach((listener) => listener(tabId, { status: 'complete' }, { url: landing[url] ?? url, windowId: 7 }))));
  return {
    calls,
    chrome: {
      tabs: {
        create: vi.fn(async ({ url }: { url: string }) => (calls.push(`create ${url}`), load(5, url), { id: 5, windowId: 7 })),
        update: vi.fn(async (tabId: number, props: { url?: string; active?: boolean }) => {
          calls.push(`update ${tabId} ${props.url ?? `active=${String(props.active)}`}`);
          if (props.url) load(tabId, props.url);
          return { id: tabId, windowId: 7 };
        }),
        remove: vi.fn(async (tabId: number) => void calls.push(`remove ${tabId}`)),
        get: vi.fn(async (tabId: number) => ({ id: tabId, status: 'complete', url: landed, windowId: 7 })),
        group: vi.fn(async () => 11),
        onUpdated: { addListener: (listener: Listener) => listeners.add(listener), removeListener: (listener: Listener) => listeners.delete(listener) },
      },
      tabGroups: { update: vi.fn(async (_id: number, props: { title?: string }) => void calls.push(`group ${props.title}`)) },
      windows: { update: vi.fn(async (id: number) => void calls.push(`focus window ${id}`)) },
      scripting: { executeScript: vi.fn(async () => [{ result: scriptResult }]) },
    },
  };
};

let fake: ReturnType<typeof fakeChrome>;
const install = async (landing: Record<string, string> = {}, scriptResult: unknown = undefined) => {
  fake = fakeChrome(landing, scriptResult);
  (globalThis as { chrome?: unknown }).chrome = fake.chrome;
  vi.resetModules();
  return (await import('./chrome-browser.js')).chromeBrowser;
};
beforeEach(() => vi.useRealTimers());
afterEach(() => delete (globalThis as { chrome?: unknown }).chrome);

describe('chrome browser adapter', () => {
  it('opens one background tab in a group named Candydati, follows redirects, and closes it', async () => {
    const browser = await install({ 'https://www.linkedin.com/search': 'https://www.linkedin.com/login' });
    expect(await browser.open('https://www.linkedin.com/search')).toEqual({ tabId: 5, url: 'https://www.linkedin.com/login' });
    expect(fake.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/search', active: false });
    expect(fake.calls).toContain('group Candydati');
    expect(await browser.navigate(5, 'https://www.linkedin.com/in/maja/')).toBe('https://www.linkedin.com/in/maja/');
    await browser.close(5);
    expect(fake.calls.at(-1)).toBe('remove 5');
  });

  it('reads through the page scripts, with empty answers when a script gives nothing', async () => {
    const browser = await install({}, ['https://www.linkedin.com/in/a/']);
    expect(await browser.profileHrefs(5)).toEqual(['https://www.linkedin.com/in/a/']);
    const empty = await install({}, undefined);
    expect(await empty.profileHrefs(5)).toEqual([]);
    expect(await empty.readPage(5)).toEqual({ url: '', title: '', heading: null, main: '' });
  });

  it('brings the tab and its window to the person for a check only they can pass', async () => {
    const browser = await install();
    await browser.focus(5);
    expect(fake.calls).toEqual(['update 5 active=true', 'focus window 7']);
  });
});
