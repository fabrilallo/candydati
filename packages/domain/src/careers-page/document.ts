import { z } from 'zod';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '../platform/config.js';
import type { MediaKind } from './media.js';
import { CAREERS_LIMITS, careersSectionSchema, type CareersSection } from './sections.js';
import { careersThemeSchema, DEFAULT_CAREERS_THEME } from './theme.js';

export const CAREERS_PAGE_VERSION = 1;

const sectionsRules = (sections: readonly CareersSection[], context: z.RefinementCtx): void => {
  const seen = new Set<string>();
  sections.forEach((section, index) => {
    if (seen.has(section.id)) context.addIssue({ code: 'custom', path: ['sections', index, 'id'], message: 'duplicate_id' });
    seen.add(section.id);
  });
  if (sections.filter((section) => section.type === 'jobs').length !== 1) context.addIssue({ code: 'custom', path: ['sections'], message: 'jobs_exactly_one' });
  const heroes = sections.flatMap((section, index) => (section.type === 'hero' ? [index] : []));
  if (heroes.length > 1) context.addIssue({ code: 'custom', path: ['sections'], message: 'hero_at_most_one' });
  if (heroes.length === 1 && heroes[0] !== 0) context.addIssue({ code: 'custom', path: ['sections', heroes[0]!], message: 'hero_first' });
};

/**
 * The careers page of an organization: a theme and an ordered list of sections. Validated with this schema when it is
 * written and again when it is read back (the stored JSON is data, not trusted). The open positions (`jobs`) are always
 * there, exactly once.
 */
export const careersPageDocumentSchema = z
  .strictObject({
    version: z.literal(CAREERS_PAGE_VERSION),
    /** The language a visitor sees when the page has no text in theirs. */
    defaultLocale: z.enum(SUPPORTED_LOCALES),
    theme: careersThemeSchema,
    sections: z.array(careersSectionSchema).min(1).max(CAREERS_LIMITS.sections, 'too_many_sections'),
  })
  .superRefine((document, context) => sectionsRules(document.sections, context));

export type CareersPageDocument = z.output<typeof careersPageDocumentSchema>;
export type CareersPageDocumentInput = z.input<typeof careersPageDocumentSchema>;

const truncate = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/**
 * The page of an organization that never saved one: its name as the headline and the open positions. It reads like the
 * careers page did before the builder existed.
 */
export const defaultCareersPage = (organizationName: string, defaultLocale: Locale = DEFAULT_LOCALE): CareersPageDocument => {
  const name = truncate(organizationName.trim() || '-', 90);
  return {
    version: CAREERS_PAGE_VERSION,
    defaultLocale,
    theme: DEFAULT_CAREERS_THEME,
    sections: [
      {
        id: 'hero',
        type: 'hero',
        visible: true,
        headline: { it: `Posizioni aperte in ${name}`, en: `Open positions at ${name}` },
        subheadline: {
          it: 'Ogni annuncio dice quanto si guadagna e come si seleziona, prima che tu ti candidi.',
          en: 'Every ad tells you the pay and how we select, before you apply.',
        },
        ctaLabel: {},
        background: { kind: 'none' },
        overlay: 55,
        alignment: 'start',
      },
      { id: 'jobs', type: 'jobs', visible: true, title: {}, intro: {} },
    ],
  };
};

export interface MediaReference {
  readonly id: string;
  readonly kind: MediaKind;
}

const referencesOf = (section: CareersSection): readonly MediaReference[] => {
  const image = (id: string | undefined): MediaReference[] => (id ? [{ id, kind: 'image' }] : []);
  switch (section.type) {
    case 'hero':
      if (section.background.kind === 'image') return image(section.background.imageId);
      if (section.background.kind === 'video') return [{ id: section.background.videoId, kind: 'video' }, ...image(section.background.posterId)];
      return [];
    case 'image_text':
      return image(section.imageId);
    case 'gallery':
      return section.images.flatMap((item) => image(item.imageId));
    case 'video':
      return section.source.kind === 'upload' ? [{ id: section.source.videoId, kind: 'video' }, ...image(section.source.posterId)] : image(section.source.posterId);
    case 'testimonials':
      return section.items.flatMap((item) => image(item.photoId));
    default:
      return [];
  }
};

/** Every media file the page uses (hidden sections included), each once. */
export const mediaReferences = (document: CareersPageDocument): readonly MediaReference[] => {
  const all = document.sections.flatMap(referencesOf);
  return all.filter((reference, index) => all.findIndex((other) => other.id === reference.id) === index);
};

/** What a visitor sees: the hidden sections are left out. */
export const visibleSections = (document: CareersPageDocument): CareersPageDocument => ({
  ...document,
  sections: document.sections.filter((section) => section.visible),
});
