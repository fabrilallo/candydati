/** Google addresses the extension builds and reads for a web search. It reads www.google.com only. */
const GOOGLE = 'https://www.google.com';
/** Google's own hosts (any country), its cache and translation proxies: never a result. */
const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|gstatic\.com)$/;

/** Google search for these words; `start` is how many results come before (0 for the first page). */
export function googleSearchUrl(query: string, num: number, start: number): string {
  const url = new URL('/search', GOOGLE);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(num));
  if (start > 0) url.searchParams.set('start', String(start));
  return url.toString();
}

const parse = (href: string): URL | null => {
  try {
    return new URL(href);
  } catch {
    return null;
  }
};

/**
 * The address a result points to: Google's redirect (`/url?q=…`) unwrapped, the fragment Google adds (`#:~:text=`) cut,
 * only http(s), never one of Google's own pages. Null for anything else.
 */
export function resultLink(href: string): string | null {
  const url = parse(href);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (GOOGLE_HOST.test(host) && url.pathname === '/url') {
    const target = url.searchParams.get('q') ?? url.searchParams.get('url');
    return target && !GOOGLE_HOST.test(parse(target)?.hostname.toLowerCase() ?? 'google.com') ? resultLink(target) : null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || GOOGLE_HOST.test(host)) return null;
  url.hash = '';
  return url.toString();
}

export type GooglePageState = 'ok' | 'captcha' | 'consent_required';

/**
 * Where Google sent the tab: its "unusual traffic" check (`/sorry/`, only the person may pass it), its cookie consent
 * page, or the results. An address the extension may not read (empty: the tab left www.google.com, in practice for the
 * consent page on consent.google.com) counts as the consent page: the person sees it in the tab.
 */
export function classifyGooglePage(href: string): GooglePageState {
  const url = parse(href);
  if (!url || url.hostname.startsWith('consent.')) return 'consent_required';
  if (url.pathname.startsWith('/sorry')) return 'captcha';
  return 'ok';
}
