/** LinkedIn addresses the extension builds and reads. The extension visits linkedin.com only. */
const LINKEDIN = 'https://www.linkedin.com';

/**
 * The Candydati app may talk to the extension only from the origins it was built for (`externally_connectable`). A
 * pattern is an origin, or `https://*.domain` for the domain and every subdomain of it.
 */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  if (origin === undefined) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return allowed.some((pattern) => {
    const wildcard = /^https:\/\/\*\.(.+)$/.exec(pattern)?.[1];
    if (!wildcard) return pattern === url.origin;
    return url.protocol === 'https:' && url.port === '' && (url.hostname === wildcard || url.hostname.endsWith(`.${wildcard}`));
  });
}

/** LinkedIn's people search for these words and place, at `page` (1 is the first). */
export function searchUrl(keywords: readonly string[], location: string | null, page: number): string {
  const url = new URL('/search/results/people/', LINKEDIN);
  url.searchParams.set('keywords', [...keywords, ...(location ? [location] : [])].join(' '));
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

/** One canonical address per profile (`https://www.linkedin.com/in/<handle>/`); null for anything that is not a profile. */
export function profileLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
  const handle = /^\/in\/([^/?#]+)/.exec(url.pathname)?.[1];
  return handle ? `${LINKEDIN}/in/${decodeURIComponent(handle).toLowerCase()}/` : null;
}

export type PageState = 'ok' | 'not_logged_in' | 'captcha';

/** Where LinkedIn sent the tab: its login wall, a security check (the person must act), or a normal page. */
export function classifyPage(href: string): PageState {
  const path = new URL(href).pathname;
  if (path.startsWith('/login') || path.startsWith('/authwall') || path.startsWith('/uas/login')) return 'not_logged_in';
  if (path.startsWith('/checkpoint')) return 'captcha';
  return 'ok';
}
