import { z } from 'zod';
import { httpUrlSchema } from '../url/http-url.js';
import { VALUE_ICONS } from './icons.js';
import { optionalLocalizedSchema, requiredLocalizedSchema } from './localized.js';
import { mediaIdSchema } from './media.js';
import { VIMEO_ID, YOUTUBE_ID } from './video.js';

/** Length limits of every field, in characters. */
export const CAREERS_LIMITS = {
  sections: 24,
  headline: 120,
  subheadline: 280,
  cta: 40,
  title: 120,
  body: 4000,
  sideBody: 2000,
  caption: 280,
  alt: 200,
  valueTitle: 80,
  valueText: 280,
  numberValue: 12,
  numberLabel: 60,
  quote: 600,
  personName: 80,
  personRole: 80,
  linkLabel: 60,
  url: 500,
  jobsIntro: 400,
} as const;

export const SECTION_TYPES = ['hero', 'text', 'image_text', 'gallery', 'video', 'values', 'numbers', 'testimonials', 'jobs', 'links'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Stable, url-safe id: anchors and the editor's list keys. */
export const sectionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'section_id');

/** Dark scrim over a hero image or video: never below this, so the white headline stays readable. */
export const HERO_MIN_OVERLAY = 40;

const base = { id: sectionIdSchema, visible: z.boolean().default(true) };
const optionalTitle = optionalLocalizedSchema(CAREERS_LIMITS.title).default({});

const heroBackgroundSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('image'), imageId: mediaIdSchema }),
  z.strictObject({ kind: z.literal('video'), videoId: mediaIdSchema, posterId: mediaIdSchema }),
]);
export type HeroBackground = z.output<typeof heroBackgroundSchema>;

export const heroSectionSchema = z
  .strictObject({
    ...base,
    type: z.literal('hero'),
    headline: requiredLocalizedSchema(CAREERS_LIMITS.headline),
    subheadline: optionalLocalizedSchema(CAREERS_LIMITS.subheadline).default({}),
    ctaLabel: optionalLocalizedSchema(CAREERS_LIMITS.cta).default({}),
    background: heroBackgroundSchema,
    /** Percent of the dark scrim over the background media. */
    overlay: z.number().int().min(0).max(90).default(55),
    alignment: z.enum(['start', 'center']).default('start'),
  })
  .refine((hero) => hero.background.kind === 'none' || hero.overlay >= HERO_MIN_OVERLAY, { path: ['overlay'], message: 'overlay_too_low' });

export const textSectionSchema = z.strictObject({
  ...base,
  type: z.literal('text'),
  title: optionalTitle,
  body: requiredLocalizedSchema(CAREERS_LIMITS.body),
});

export const imageTextSectionSchema = z.strictObject({
  ...base,
  type: z.literal('image_text'),
  imageId: mediaIdSchema,
  alt: requiredLocalizedSchema(CAREERS_LIMITS.alt),
  imageSide: z.enum(['left', 'right']).default('left'),
  title: optionalTitle,
  body: requiredLocalizedSchema(CAREERS_LIMITS.sideBody),
});

export const galleryItemSchema = z.strictObject({ imageId: mediaIdSchema, alt: requiredLocalizedSchema(CAREERS_LIMITS.alt) });

export const gallerySectionSchema = z.strictObject({
  ...base,
  type: z.literal('gallery'),
  title: optionalTitle,
  images: z.array(galleryItemSchema).min(2, 'gallery_min').max(9, 'gallery_max'),
});

const videoSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upload'), videoId: mediaIdSchema, posterId: mediaIdSchema }),
  z.strictObject({ kind: z.literal('youtube'), videoId: z.string().regex(YOUTUBE_ID, 'video_id'), posterId: mediaIdSchema.optional() }),
  z.strictObject({ kind: z.literal('vimeo'), videoId: z.string().regex(VIMEO_ID, 'video_id'), posterId: mediaIdSchema.optional() }),
]);
export type VideoSource = z.output<typeof videoSourceSchema>;

export const videoSectionSchema = z.strictObject({
  ...base,
  type: z.literal('video'),
  /** Also the accessible name of the player. */
  title: requiredLocalizedSchema(CAREERS_LIMITS.title),
  caption: optionalLocalizedSchema(CAREERS_LIMITS.caption).default({}),
  source: videoSourceSchema,
});

export const valueItemSchema = z.strictObject({
  icon: z.enum(VALUE_ICONS),
  title: requiredLocalizedSchema(CAREERS_LIMITS.valueTitle),
  text: optionalLocalizedSchema(CAREERS_LIMITS.valueText).default({}),
});

export const valuesSectionSchema = z.strictObject({
  ...base,
  type: z.literal('values'),
  title: optionalTitle,
  items: z.array(valueItemSchema).min(3, 'values_min').max(8, 'values_max'),
});

export const numberItemSchema = z.strictObject({
  /** The figure as written ("42", "3,5k", "2019", "98%"). */
  value: z.string().trim().min(1, 'required').max(CAREERS_LIMITS.numberValue, 'too_long'),
  label: requiredLocalizedSchema(CAREERS_LIMITS.numberLabel),
});

export const numbersSectionSchema = z.strictObject({
  ...base,
  type: z.literal('numbers'),
  title: optionalTitle,
  items: z.array(numberItemSchema).min(2, 'numbers_min').max(4, 'numbers_max'),
});

export const testimonialSchema = z.strictObject({
  quote: requiredLocalizedSchema(CAREERS_LIMITS.quote),
  name: z.string().trim().min(1, 'required').max(CAREERS_LIMITS.personName, 'too_long'),
  role: optionalLocalizedSchema(CAREERS_LIMITS.personRole).default({}),
  photoId: mediaIdSchema.optional(),
});

export const testimonialsSectionSchema = z.strictObject({
  ...base,
  type: z.literal('testimonials'),
  title: optionalTitle,
  items: z.array(testimonialSchema).min(1, 'testimonials_min').max(6, 'testimonials_max'),
});

export const jobsSectionSchema = z.strictObject({
  ...base,
  type: z.literal('jobs'),
  title: optionalTitle,
  intro: optionalLocalizedSchema(CAREERS_LIMITS.jobsIntro).default({}),
});

export const LINK_KINDS = ['website', 'linkedin', 'instagram', 'facebook', 'x', 'youtube', 'github', 'tiktok', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const linkItemSchema = z.strictObject({
  kind: z.enum(LINK_KINDS),
  url: z.string().trim().max(CAREERS_LIMITS.url, 'too_long').pipe(httpUrlSchema),
  label: optionalLocalizedSchema(CAREERS_LIMITS.linkLabel).default({}),
});

export const linksSectionSchema = z.strictObject({
  ...base,
  type: z.literal('links'),
  title: optionalTitle,
  items: z.array(linkItemSchema).min(1, 'links_min').max(8, 'links_max'),
});

export const careersSectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  textSectionSchema,
  imageTextSectionSchema,
  gallerySectionSchema,
  videoSectionSchema,
  valuesSectionSchema,
  numbersSectionSchema,
  testimonialsSectionSchema,
  jobsSectionSchema,
  linksSectionSchema,
]);
export type CareersSection = z.output<typeof careersSectionSchema>;
export type CareersSectionInput = z.input<typeof careersSectionSchema>;
export type SectionOf<T extends SectionType> = Extract<CareersSection, { type: T }>;
