import { randomInt } from 'node:crypto';
import type { APIResponse, BrowserContext, Route } from '@playwright/test';
import { API_URL, BASE_URL } from './env';

/** A random private client address, so each browser context has its own rate-limit bucket. */
export const clientIp = (): string => `10.${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A dev api restarts when its files change: a refused connection is retried for a few seconds before it is reported. */
const fetchWithRetry = async (route: Route, options: Parameters<Route['fetch']>[0]): Promise<APIResponse> => {
  const attempts = 30;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await route.fetch(options);
    } catch (error) {
      if (attempt === attempts) throw error;
      await sleep(1_000);
    }
  }
};

/**
 * The api rate-limits per client IP (sign-up/sign-in 20 per minute, public applications 5 per 10 minutes), and the
 * web proxy only believes the real socket address, so a whole suite run from one machine would share one budget.
 * Browser calls to `/api/**` are therefore sent straight to the api (which trusts `X-Forwarded-For` from loopback)
 * with a per-context address. Same cookies, same paths, same origin as far as the page can tell.
 * Set `API_URL=proxy` to go through the web proxy untouched (a stack with relaxed limits, e.g. CI).
 */
export const isolateClient = async (context: BrowserContext): Promise<void> => {
  if (API_URL === 'proxy') return;
  const ip = clientIp();
  const web = new URL(BASE_URL);
  // A regex (not a function): a dev page loads thousands of modules and a function would be asked about every one.
  const escaped = web.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await context.route(
    new RegExp(`^${escaped}/api(/|\\?|$)`),
    async (route) => {
      const url = new URL(route.request().url());
      // Fetched from node with the context's own cookie jar (Set-Cookie lands in it too), then handed to the page.
      const options = {
        url: `${API_URL}${url.pathname}${url.search}`,
        maxRedirects: 0,
        headers: {
          ...route.request().headers(),
          'x-forwarded-for': ip,
          'x-forwarded-host': url.host,
          'x-forwarded-proto': url.protocol.replace(':', ''),
        },
      };
      await route.fulfill({ response: await fetchWithRetry(route, options) });
    },
  );
};

/** Closes a context without errors from calls still in flight. */
export const closeClient = async (context: BrowserContext): Promise<void> => {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.close();
};
