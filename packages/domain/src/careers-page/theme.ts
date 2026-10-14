import { z } from 'zod';

/**
 * Theme of a careers page: one accent, a heading font from a small self-hosted set, a corner style. Nothing else is
 * configurable on purpose (DESIGN-SYSTEM.md: one accent, editorial type). Every colour the page uses is derived here
 * so that text always reaches WCAG AA (4.5:1), in the light and in the dark theme.
 */

export const MIN_TEXT_CONTRAST = 4.5;

/** Self-hosted (`@fontsource-variable/*`), loaded only by the careers page. Geist is the app's own face. */
export const HEADING_FONTS = ['geist', 'fraunces', 'bricolage', 'newsreader'] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];

export const CORNER_STYLES = ['soft', 'sharp'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

/** Design tokens the page text sits on (DESIGN-SYSTEM.md §2.1). */
const INK = '#111318';
const PAPER = '#f6f7f9';
/** Page background and cards, light theme. */
export const LIGHT_SURFACES: readonly string[] = ['#f6f7f9', '#fdfdfe'];
/** Page background, cards and popovers, dark theme. */
export const DARK_SURFACES: readonly string[] = ['#0e1013', '#15181d', '#1a1d23'];

const HEX = /^#[0-9a-fA-F]{6}$/;

export const hexColorSchema = z
  .string()
  .regex(HEX, 'hex_color')
  .transform((value) => value.toLowerCase());

type Rgb = readonly [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as unknown as Rgb;

const toHex = (rgb: Rgb): string => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

const linear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map(linear) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.x contrast ratio, from 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

/** Text colour on an accent fill (buttons, the hero call to action): the design system's ink or paper, whichever reads better. */
export const accentForeground = (accent: string): string => (contrastRatio(accent, PAPER) >= contrastRatio(accent, INK) ? PAPER : INK);

const mix = (from: string, to: string, amount: number): string => {
  const a = toRgb(from);
  const b = toRgb(to);
  return toHex([0, 1, 2].map((index) => a[index]! + (b[index]! - a[index]!) * amount) as unknown as Rgb);
};

const worstContrast = (color: string, surfaces: readonly string[]): number => Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

/** The accent moved towards `target` in small steps until it reads on every surface (links, numbers, focus rings). */
const inkOn = (accent: string, surfaces: readonly string[], target: string): string => {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(accent, target, step / 20);
    if (worstContrast(candidate, surfaces) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return target;
};

export const careersThemeSchema = z
  .strictObject({
    accent: hexColorSchema,
    headingFont: z.enum(HEADING_FONTS),
    corners: z.enum(CORNER_STYLES),
  })
  .superRefine((theme, context) => {
    if (contrastRatio(theme.accent, accentForeground(theme.accent)) < MIN_TEXT_CONTRAST) {
      context.addIssue({ code: 'custom', path: ['accent'], message: 'accent_contrast' });
    }
  });
export type CareersTheme = z.output<typeof careersThemeSchema>;

export const DEFAULT_CAREERS_THEME: CareersTheme = { accent: '#1f47d6', headingFont: 'geist', corners: 'soft' };

export interface CareersThemeTokens {
  /** Fill of buttons and highlights. */
  readonly accent: string;
  /** Text on `accent`. */
  readonly accentForeground: string;
  /** Accent as text on the light theme surfaces. */
  readonly inkLight: string;
  /** Accent as text on the dark theme surfaces. */
  readonly inkDark: string;
}

/** Every colour the page needs, each one passing AA where it is used. */
export const careersThemeTokens = (theme: CareersTheme): CareersThemeTokens => ({
  accent: theme.accent,
  accentForeground: accentForeground(theme.accent),
  inkLight: inkOn(theme.accent, LIGHT_SURFACES, INK),
  inkDark: inkOn(theme.accent, DARK_SURFACES, PAPER),
});
