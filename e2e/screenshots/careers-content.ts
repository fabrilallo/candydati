/** The careers page of the README organization, as the builder stores it (version 1 of the document). */

export interface CareersMedia {
  readonly hero: string;
  readonly office: string;
  readonly gallery: readonly string[];
}

export const CAREERS_IMAGES = {
  hero: 'Luci della sede di Milano al tramonto',
  office: 'La sala riunioni affacciata sul cortile',
  gallery: ['La cucina comune al mattino', 'Il giardino interno della sede', 'Postazioni accanto alle vetrate'],
} as const;

const it = (text: string) => ({ it: text });

const hero = (imageId: string) => ({
  id: 'hero',
  type: 'hero',
  headline: it('Costruiamo il software che fa funzionare gli studi medici'),
  subheadline: it('Quaranta persone tra Milano, Bologna e il resto d’Italia. Ogni annuncio dice quanto si guadagna e come si seleziona.'),
  ctaLabel: it('Guarda le posizioni aperte'),
  background: { kind: 'image', imageId },
  overlay: 50,
  alignment: 'start',
});

const numbers = {
  id: 'numeri',
  type: 'numbers',
  items: [
    { value: '42', label: it('persone nel team') },
    { value: '3.000+', label: it('studi che ci usano') },
    { value: '2016', label: it('anno di fondazione') },
    { value: '4,7', label: it('voto medio dei clienti') },
  ],
};

const about = (imageId: string) => ({
  id: 'chi-siamo',
  type: 'image_text',
  imageId,
  alt: it(CAREERS_IMAGES.office),
  imageSide: 'right',
  title: it('Chi siamo'),
  body: it(
    'Officina Digitale nasce a Milano nel 2016 da tre sviluppatori stanchi delle agende di carta.\n\n' +
      'Oggi la nostra piattaforma gestisce le prenotazioni di oltre tremila studi medici. Lavoriamo in piccoli team, scriviamo le decisioni e rilasciamo spesso.',
  ),
});

const values = {
  id: 'valori',
  type: 'values',
  title: it('Cosa offriamo'),
  items: [
    {
      icon: 'house',
      title: it('Lavoro ibrido'),
      text: it('Due giorni in ufficio, il resto da dove preferisci.'),
    },
    {
      icon: 'graduation-cap',
      title: it('Formazione'),
      text: it('1.500 € l’anno a testa, più conferenze e libri.'),
    },
    {
      icon: 'heart',
      title: it('Salute'),
      text: it('Assicurazione sanitaria integrativa anche per la famiglia.'),
    },
    {
      icon: 'clock',
      title: it('Orario flessibile'),
      text: it('Nessun cartellino: contano i risultati.'),
    },
  ],
};

const gallery = (ids: readonly string[]) => ({
  id: 'galleria',
  type: 'gallery',
  title: it('Una giornata da noi'),
  images: ids.map((imageId, index) => ({
    imageId,
    alt: it(CAREERS_IMAGES.gallery[index] ?? 'La sede'),
  })),
});

const people = {
  id: 'persone',
  type: 'testimonials',
  title: it('Chi lavora qui'),
  items: [
    {
      quote: it('Al colloquio sapevo già lo stipendio e quante fasi mi aspettavano. Dopo due anni, il modo di lavorare è rimasto lo stesso.'),
      name: 'Chiara Esposito',
      role: it('Frontend developer'),
    },
  ],
};

const jobs = {
  id: 'posizioni',
  type: 'jobs',
  title: it('Posizioni aperte'),
  intro: it('Rispondiamo a ogni candidatura entro i giorni indicati nell’annuncio.'),
};

const links = {
  id: 'link',
  type: 'links',
  title: it('Seguici'),
  items: [
    {
      kind: 'website',
      url: 'https://example.com',
      label: it('Il nostro sito'),
    },
    { kind: 'linkedin', url: 'https://www.linkedin.com/company/example' },
    { kind: 'github', url: 'https://github.com/example' },
  ],
};

export const careersDocument = (media: CareersMedia) => ({
  version: 1,
  defaultLocale: 'it',
  theme: { accent: '#1f47d6', headingFont: 'geist', corners: 'soft' },
  sections: [hero(media.hero), numbers, about(media.office), values, gallery(media.gallery), people, jobs, links],
});
