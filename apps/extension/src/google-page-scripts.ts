/**
 * Functions run INSIDE a Google results page through `chrome.scripting.executeScript`. Chrome serializes each one on its
 * own, so they must not use anything from outside their body (no imports, no shared helpers). They only read what the
 * page shows; they never click, type or submit anything.
 */

/**
 * The organic results of the page, in order: the link around each result title (an `h3`), the title and the snippet.
 * Ads, "People also ask" and other Google boxes are left out. The snippet is the text Google marks as such, else the
 * text of the result outside its link. Links are filtered again outside the page (`resultLink`).
 */
export function readGoogleResults(): { href: string; title: string; snippet: string }[] {
  const root = document.querySelector('#rso') ?? document.querySelector('#search') ?? document.body;
  const skip = '#tads, #tadsb, #bottomads, [data-text-ad], .related-question-pair, [jsname="yEVEwb"], [data-initq], g-section-with-header, g-scrolling-carousel';
  const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
  // The widest block around a result that holds no other result title.
  const blockOf = (anchor: Element): Element => {
    let block = anchor;
    while (block.parentElement && block.parentElement !== root && block.parentElement.querySelectorAll('h3').length === 1) block = block.parentElement;
    return block;
  };
  return Array.from(root.querySelectorAll('h3')).flatMap((heading) => {
    const anchor = heading.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor || heading.closest(skip)) return [];
    const block = blockOf(anchor);
    const marked = block.querySelector('[data-sncf], .VwiC3b, [style*="-webkit-line-clamp"]');
    const rest = clean(block.textContent).replace(clean(anchor.textContent), '');
    return [{ href: anchor.href, title: clean(heading.textContent), snippet: clean(marked?.textContent) || clean(rest) }];
  });
}
