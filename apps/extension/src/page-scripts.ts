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

/** The addresses of the profiles linked from the page (a search result page lists one per person). */
export function collectProfileHrefs(): string[] {
  const root = document.querySelector('main') ?? document.body;
  return Array.from(root.querySelectorAll('a[href*="/in/"]'), (anchor) => (anchor as HTMLAnchorElement).href);
}

/** The page title, the first heading of the main section and its visible text. */
export function readProfilePage(): { url: string; title: string; heading: string | null; main: string } {
  const main = document.querySelector('main');
  const heading = main?.querySelector('h1')?.textContent?.trim() ?? null;
  return { url: location.href, title: document.title, heading, main: (main as HTMLElement | null)?.innerText ?? '' };
}
