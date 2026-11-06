import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (tabId: number, change: { status?: string }, tab: { url?: string; windowId: number }) => void;

/** A fake of the Chrome APIs: every navigation "loads" right away; Google's consent page is not readable (no url). */
const fakeChrome = (scriptResult: unknown) => {
  const listeners = new Set<Listener>();
  const calls: string[] = [];
  let landed: { url?: string; windowId: number } = { windowId: 7 };
  const load = (tabId: number, url: string) => ((landed = url.includes('consent') ? { windowId: 7 } : { url, windowId: 7 }), queueMicrotask(() => listeners.forEach((listener) => listener(tabId, { status: 'complete' }, landed))));
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
        get: vi.fn(async (tabId: number) => ({ ...landed, id: tabId, status: 'complete' })),
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
const install = async (scriptResult: unknown = undefined) => {
  fake = fakeChrome(scriptResult);
  (globalThis as { chrome?: unknown }).chrome = fake.chrome;
  vi.resetModules();
  return (await import('./chrome-web-browser.js')).chromeWebBrowser;
};
afterEach(() => delete (globalThis as { chrome?: unknown }).chrome);

describe('chrome web browser adapter', () => {
  it('opens Google in the Candydati group without waiting for a LinkedIn page, navigates, and closes', async () => {
    const browser = await install([{ href: 'https://github.com/gverdi', title: 'gverdi · GitHub', snippet: '' }]);
    expect(await browser.open('https://www.google.com/search?q=Go')).toEqual({ tabId: 5, url: 'https://www.google.com/search?q=Go' });
    expect(fake.calls).toContain('group Candydati');
    expect(await browser.results(5)).toEqual([{ href: 'https://github.com/gverdi', title: 'gverdi · GitHub', snippet: '' }]);
    expect(fake.chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(await browser.navigate(5, 'https://consent.google.com/ml')).toBe('');
    await browser.focus(5);
    await browser.close(5);
    expect(fake.calls.slice(-3)).toEqual(['update 5 active=true', 'focus window 7', 'remove 5']);
  });

  it('reads no results when the script gives nothing', async () => {
    const browser = await install(undefined);
    expect(await browser.results(5)).toEqual([]);
  });
});
