import type { CareersPageDocumentInput } from './document.js';

export interface CareersFixtureMedia {
  readonly image: string;
  readonly image2: string;
  readonly video: string;
  readonly poster: string;
}

export const CAREERS_FIXTURE_MEDIA: CareersFixtureMedia = {
  image: '11111111-1111-4111-8111-111111111111',
  image2: '22222222-2222-4222-8222-222222222222',
  video: '33333333-3333-4333-8333-333333333333',
  poster: '44444444-4444-4444-8444-444444444444',
};

/** A page with one section of every type, for tests of every layer. */
export const careersPageFixture = (media: CareersFixtureMedia = CAREERS_FIXTURE_MEDIA): CareersPageDocumentInput => ({
  version: 1,
  defaultLocale: 'it',
  theme: { accent: '#0b6e4f', headingFont: 'fraunces', corners: 'sharp' },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      headline: { it: 'Costruiamo software che conta', en: 'We build software that matters' },
      subheadline: { it: 'Trenta persone, una sede a Bologna, tanto lavoro da remoto.' },
      ctaLabel: { it: 'Guarda le posizioni' },
      background: { kind: 'video', videoId: media.video, posterId: media.poster },
      overlay: 60,
      alignment: 'start',
    },
    { id: 'chi-siamo', type: 'text', title: { it: 'Chi siamo' }, body: { it: 'Siamo nati nel 2015.\n\nOggi lavoriamo con clienti in tutta Europa.' } },
    { id: 'ufficio', type: 'image_text', imageId: media.image, alt: { it: 'Il team in ufficio' }, imageSide: 'right', title: { it: "L'ufficio" }, body: { it: 'Luce, piante e caffè buono.' } },
    {
      id: 'galleria',
      type: 'gallery',
      title: { it: 'Una giornata da noi' },
      images: [
        { imageId: media.image, alt: { it: 'Riunione del lunedì' } },
        { imageId: media.image2, alt: { it: 'Pranzo insieme', en: 'Lunch together' } },
      ],
    },
    { id: 'video', type: 'video', title: { it: 'Il nostro lavoro in due minuti' }, source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' } },
    {
      id: 'valori',
      type: 'values',
      title: { it: 'Cosa offriamo' },
      items: [
        { icon: 'house', title: { it: 'Lavoro da remoto' }, text: { it: 'Tre giorni a settimana.' } },
        { icon: 'graduation-cap', title: { it: 'Formazione' }, text: { it: '1.500 € l’anno a testa.' } },
        { icon: 'heart', title: { it: 'Assicurazione sanitaria' } },
      ],
    },
    {
      id: 'numeri',
      type: 'numbers',
      items: [
        { value: '42', label: { it: 'persone', en: 'people' } },
        { value: '2015', label: { it: 'anno di fondazione' } },
      ],
    },
    { id: 'persone', type: 'testimonials', items: [{ quote: { it: 'Qui ho imparato più che in cinque anni altrove.' }, name: 'Giulia Bianchi', role: { it: 'Backend developer' }, photoId: media.image2 }] },
    { id: 'jobs', type: 'jobs', title: { it: 'Posizioni aperte' }, intro: {} },
    { id: 'link', type: 'links', items: [{ kind: 'linkedin', url: 'https://www.linkedin.com/company/example' }, { kind: 'website', url: 'https://example.com', label: { it: 'Il nostro sito' } }] },
  ],
});
