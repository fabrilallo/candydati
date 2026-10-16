import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.0 and 2.1, levels A and AA. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export type Theme = 'light' | 'dark';
export const THEMES: readonly Theme[] = ['light', 'dark'];

/** Switches the theme the way the colour-mode module does (class on <html>), without a reload. */
export const setTheme = async (page: Page, theme: Theme): Promise<void> => {
  await page.evaluate((value) => {
    const root = document.documentElement;
    root.classList.toggle('dark', value === 'dark');
    root.classList.toggle('light', value === 'light');
  }, theme);
  // Some controls fade colours (150 ms): measure once every transition is over. A fixed wait was too short on a busy
  // CI runner (axe read the light text colour on the dark background, half-way through the fade).
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
};

export interface AuditOptions {
  /** Selectors axe leaves out. Each use must say, next to it, which rule is not applicable and why. */
  readonly exclude?: readonly string[];
  /** Restrict to a part of the page (an open dialog). */
  readonly include?: string;
}

/** Runs axe on the current page in both themes and fails with a readable list of every violation. */
export const expectNoViolations = async (page: Page, name: string, options: AuditOptions = {}): Promise<void> => {
  for (const theme of THEMES) {
    await setTheme(page, theme);
    let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
    if (options.include) builder = builder.include(options.include);
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
    const { violations } = await builder.analyze();
    const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')}  ${n.failureSummary?.split('\n').slice(1).join(' ')}`).join('\n')}`);
    expect(report, `${name} [${theme}]`).toEqual([]);
  }
  await setTheme(page, 'light');
};
