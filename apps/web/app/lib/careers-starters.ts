import type { CareersSection, Locale, LocalizedText, SectionType } from '@candydati/domain'

/**
 * Content of a section just added: text where the schema requires it, written in the editing language, so the
 * preview shows something meaningful at once. Nothing is invented that the organization must state itself (figures,
 * quotes, links stay empty and show their issue in place until written).
 */

/** Translates a `careersEditor.starter.*` key in the editing language. */
export type StarterText = (key: string) => string

const BASE = 'careersEditor.starter'

const textIn = (locale: Locale, value: string): LocalizedText => ({ [locale]: value })

type Builder = (id: string, tr: StarterText, locale: Locale) => CareersSection

const BUILDERS: Readonly<Record<Exclude<SectionType, 'jobs'>, Builder>> = {
  hero: (id, tr, locale) => ({ id, type: 'hero', visible: true, headline: textIn(locale, tr(`${BASE}.hero.headline`)), subheadline: {}, ctaLabel: {}, background: { kind: 'none' }, overlay: 55, alignment: 'start' }),
  text: (id, tr, locale) => ({ id, type: 'text', visible: true, title: textIn(locale, tr(`${BASE}.text.title`)), body: textIn(locale, tr(`${BASE}.text.body`)) }),
  image_text: (id, tr, locale) => ({ id, type: 'image_text', visible: true, imageId: '', alt: {}, imageSide: 'left', title: textIn(locale, tr(`${BASE}.imageText.title`)), body: textIn(locale, tr(`${BASE}.imageText.body`)) }),
  gallery: (id, tr, locale) => ({ id, type: 'gallery', visible: true, title: textIn(locale, tr(`${BASE}.gallery.title`)), images: [] }),
  video: (id, tr, locale) => ({ id, type: 'video', visible: true, title: textIn(locale, tr(`${BASE}.video.title`)), caption: {}, source: { kind: 'youtube', videoId: '' } }),
  values: (id, tr, locale) => ({
    id,
    type: 'values',
    visible: true,
    title: textIn(locale, tr(`${BASE}.values.title`)),
    items: (['house', 'graduation-cap', 'heart'] as const).map((icon, index) => ({ icon, title: textIn(locale, tr(`${BASE}.values.item${index + 1}`)), text: {} })),
  }),
  numbers: (id, tr, locale) => ({
    id,
    type: 'numbers',
    visible: true,
    title: {},
    items: [1, 2].map((index) => ({ value: '', label: textIn(locale, tr(`${BASE}.numbers.label${index}`)) })),
  }),
  testimonials: (id, tr, locale) => ({ id, type: 'testimonials', visible: true, title: textIn(locale, tr(`${BASE}.testimonials.title`)), items: [{ quote: {}, name: '', role: {} }] }),
  links: (id) => ({ id, type: 'links', visible: true, title: {}, items: [{ kind: 'website', url: '', label: {} }] }),
}

export const starterSection = (type: Exclude<SectionType, 'jobs'>, id: string, tr: StarterText, locale: Locale): CareersSection => BUILDERS[type](id, tr, locale)
