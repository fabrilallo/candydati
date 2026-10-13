import type { Page } from '@playwright/test';
import { BASE_URL } from './env';

interface NuxtRoot extends HTMLElement {
  __vue_app__?: { config: { globalProperties: { $nuxt?: { isHydrating?: boolean }; $router?: { push: (to: string) => Promise<unknown> } } } };
}

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
    const pushed = await page.evaluate(async (to) => {
      const router = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.config.globalProperties.$router;
      if (!router) return false;
      await router.push(to);
      return true;
    }, path);
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
