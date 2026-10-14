import { describe, expect, it } from 'vitest';
import {
  accentForeground,
  careersThemeSchema,
  careersThemeTokens,
  contrastRatio,
  DARK_SURFACES,
  DEFAULT_CAREERS_THEME,
  LIGHT_SURFACES,
  MIN_TEXT_CONTRAST,
} from './theme.js';

describe('contrastRatio', () => {
  it('is 21 between black and white and 1 between equal colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#1f47d6', '#1f47d6')).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1f47d6', '#f6f7f9')).toBeCloseTo(contrastRatio('#f6f7f9', '#1f47d6'), 10);
  });

  it('matches the measured cobalt button label of the design system (6.68)', () => {
    expect(contrastRatio('#1f47d6', '#f6f7f9')).toBeCloseTo(6.68, 1);
  });
});

describe('accentForeground', () => {
  it('puts light text on a dark accent and dark text on a light one', () => {
    expect(accentForeground('#1f47d6')).toBe('#f6f7f9');
    expect(accentForeground('#ffd54a')).toBe('#111318');
  });
});

describe('careersThemeSchema', () => {
  it('accepts the default theme and lower-cases the accent', () => {
    expect(careersThemeSchema.parse({ ...DEFAULT_CAREERS_THEME, accent: '#1F47D6' }).accent).toBe('#1f47d6');
  });

  it('refuses a colour that is not a six digit hex', () => {
    for (const accent of ['blue', '#12345', '#1234567', 'rgb(0,0,0)', '#gggggg', 'javascript:alert(1)']) {
      expect(careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, accent }).success).toBe(false);
    }
  });

  it('refuses an accent on which no text reaches AA contrast', () => {
    const result = careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, accent: '#767676' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['accent'], message: 'accent_contrast' });
  });

  it('refuses unknown fonts, corner styles and extra keys', () => {
    expect(careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, headingFont: 'comic-sans' }).success).toBe(false);
    expect(careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, corners: 'round' }).success).toBe(false);
    expect(careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, css: 'body{}' }).success).toBe(false);
  });
});

describe('careersThemeTokens', () => {
  const worst = (color: string, surfaces: readonly string[]): number => Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

  it('derives text colours that pass AA on every surface, in both themes, for any accepted accent', () => {
    for (const accent of ['#1f47d6', '#ffd54a', '#00a870', '#e4572e', '#f0f0f0', '#101010', '#7d9bff']) {
      const theme = careersThemeSchema.safeParse({ ...DEFAULT_CAREERS_THEME, accent });
      if (!theme.success) continue;
      const tokens = careersThemeTokens(theme.data);
      expect(contrastRatio(tokens.accent, tokens.accentForeground)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(worst(tokens.inkLight, LIGHT_SURFACES)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(worst(tokens.inkDark, DARK_SURFACES)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps an accent that already passes as the light ink', () => {
    expect(careersThemeTokens(DEFAULT_CAREERS_THEME).inkLight).toBe('#1f47d6');
  });

  it('lightens a dark accent for the dark theme', () => {
    const tokens = careersThemeTokens(DEFAULT_CAREERS_THEME);
    expect(tokens.inkDark).not.toBe('#1f47d6');
    expect(worst(tokens.inkDark, DARK_SURFACES)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
