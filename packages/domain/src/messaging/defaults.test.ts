import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { DEFAULT_EMAIL_TEMPLATES, defaultEmailTemplate } from './defaults.js';
import { emailTemplateInputSchema, isSingletonKind, SINGLETON_TEMPLATE_KINDS } from './template.js';
import { findUnknownVariables } from './variables.js';

describe('default templates', () => {
  it.each(SUPPORTED_LOCALES.flatMap((locale) => SINGLETON_TEMPLATE_KINDS.map((kind) => [locale, kind] as const)))(
    '%s %s is valid, uses only known variables and has no dashes',
    (locale, kind) => {
      const template = defaultEmailTemplate(kind, locale);
      expect(emailTemplateInputSchema.safeParse({ ...template, kind }).success).toBe(true);
      expect(findUnknownVariables(template.subject, template.body)).toEqual([]);
      expect(`${template.name}${template.subject}${template.body}`).not.toMatch(/[–—]/);
    },
  );

  it('covers every locale and kind', () => {
    for (const locale of SUPPORTED_LOCALES) expect(Object.keys(DEFAULT_EMAIL_TEMPLATES[locale])).toEqual([...SINGLETON_TEMPLATE_KINDS]);
  });

  it('restates the response commitment in the receipt, and promises nothing in the rejection', () => {
    expect(defaultEmailTemplate('receipt', 'it').body).toContain('{{ job.responseDays }}');
    expect(defaultEmailTemplate('receipt', 'en').body).toContain('{{ job.responseDays }}');
    expect(defaultEmailTemplate('outcome_not_selected', 'it').body).not.toContain('{{ job.responseDays }}');
  });

  it('knows which kinds are singletons', () => {
    expect(isSingletonKind('receipt')).toBe(true);
    expect(isSingletonKind('custom')).toBe(false);
  });
});
