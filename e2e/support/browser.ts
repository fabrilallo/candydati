/**
 * A user agent that is not a crawler. The headless browser of Playwright announces itself as `HeadlessChrome`, which the
 * visit counter leaves out on purpose, so a visitor whose visit has to be counted pretends to be a regular Chrome.
 */
export const VISITOR_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
