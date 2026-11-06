/**
 * Functions run INSIDE a LinkedIn page through `chrome.scripting.executeScript`. Chrome serializes each one on its own,
 * so they must not use anything from outside their body (no imports, no shared helpers). They only read what the page
 * shows; they never click, type or submit anything.
 */

/** Waits for the page to render its main content (LinkedIn renders in the browser), up to 15 seconds. */
export async function waitForMain(): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.querySelector('main')?.textContent?.trim()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * The addresses of the people a search result page lists. LinkedIn renders the results as the page scrolls, so it
 * scrolls until the list stops growing. Only the links of the result items count (one person each): links inside a
 * paragraph are mentions, such as the mutual connections under a result, and are left out.
 */
export async function collectProfileHrefs(): Promise<string[]> {
  const root = document.querySelector('main') ?? document.body;
  const anchors = (): HTMLAnchorElement[] => {
    const items = Array.from(root.querySelectorAll('[role="listitem"]'));
    const scopes = items.length > 0 ? items : [root];
    return scopes.flatMap((scope) => Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')));
  };
  let count = -1;
  for (let round = 0; round < 6 && anchors().length !== count; round += 1) {
    count = anchors().length;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  window.scrollTo(0, 0);
  return anchors().filter((anchor) => anchor.closest('p') === null).map((anchor) => anchor.href);
}

/** The page title, the name heading of the main section (h1, or the first h2 as LinkedIn renders it) and its text. */
export function readProfilePage(): { url: string; title: string; heading: string | null; main: string } {
  const main = document.querySelector('main');
  const heading = (main?.querySelector('h1') ?? main?.querySelector('h2'))?.textContent?.trim() || null;
  return { url: location.href, title: document.title, heading, main: (main as HTMLElement | null)?.innerText ?? '' };
}
