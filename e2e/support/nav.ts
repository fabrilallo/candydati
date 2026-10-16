import type { Page } from '@playwright/test';
import { BASE_URL } from './env';

interface NuxtApp {
  isHydrating?: boolean;
  hooks?: { hookOnce: (name: 'page:finish', callback: () => void) => void };
}

interface NuxtRouter {
  currentRoute: { value: { fullPath: string } };
  push: (to: string) => Promise<unknown>;
}

interface NuxtRoot extends HTMLElement {
  __vue_app__?: { config: { globalProperties: { $nuxt?: NuxtApp; $router?: NuxtRouter } } };
}

/** Longest wait for a client-side page to render after its route changed (async setup, data loading). */
const PAGE_FINISH_TIMEOUT_MS = 30_000;

/** A dev server compiles on first load, so the first hydration of a cold browser can take tens of seconds. */
const HYDRATION_TIMEOUT_MS = 75_000;

/** Resolves once Nuxt has hydrated the current page: before that, form submits fall back to native navigation. */
export const hydrated = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating === false,
    undefined,
    { timeout: HYDRATION_TIMEOUT_MS },
  );
};

const onApp = (page: Page): boolean => page.url().startsWith(BASE_URL);

/**
 * Goes to a page of the app. A full page load of a signed-in page makes the web server ask the api for the session, and
 * those server-side calls share one rate-limit budget (20 a minute for the whole server), so once the app is open the
 * suite moves with the app's own router, like a person clicking, and only reloads when there is nothing to navigate from.
 */
export const open = async (page: Page, path: string): Promise<void> => {
  if (onApp(page)) {
    // The route changes first; a page with an async setup renders later, and until then the previous page stays on
    // screen. Filling a form right after the push could type into the old page's fields: wait for `page:finish`.
    const pushed = await page.evaluate(
      async ({ to, timeout }) => {
        const app = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.config.globalProperties;
        const router = app?.$router;
        if (!router) return false;
        if (router.currentRoute.value.fullPath === to) return true;
        const finished = new Promise<void>((resolve) => {
          app.$nuxt?.hooks?.hookOnce('page:finish', resolve);
          setTimeout(resolve, timeout);
        });
        const failure = await router.push(to);
        if (failure === undefined) await finished;
        return true;
      },
      { to: path, timeout: PAGE_FINISH_TIMEOUT_MS },
    );
    if (pushed) return;
  }
  await page.goto(path);
  await hydrated(page);
};

/** A real full page load (public pages, links from emails). */
export const load = async (page: Page, path: string): Promise<void> => {
  await page.goto(path);
  await hydrated(page);
};
