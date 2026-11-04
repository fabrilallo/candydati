import { careersPageDocumentSchema, type CareersPageDocument } from '@candydati/domain';

const it = (text: string) => ({ it: text });

/**
 * The demo careers page: real sections in Italian (hero, text, numbers, values, testimonial, open positions), no
 * uploaded media, so it works on an empty bucket. Validated like the editor validates a save.
 */
export const DEMO_CAREERS_DOCUMENT: CareersPageDocument = careersPageDocumentSchema.parse({
  version: 1,
  defaultLocale: 'it',
  theme: { accent: '#1f47d6', headingFont: 'geist', corners: 'soft' },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      headline: it('Costruiamo il software che fa funzionare gli studi medici'),
      subheadline: it('Quaranta persone tra Milano, Bologna e il resto d’Italia. Ogni annuncio dice quanto si guadagna e come si seleziona.'),
      ctaLabel: it('Guarda le posizioni aperte'),
      background: { kind: 'none' },
      overlay: 0,
      alignment: 'start',
    },
    {
      id: 'chi-siamo',
      type: 'text',
      title: it('Chi siamo'),
      body: it(
        'Siamo nati a Milano nel 2016 da tre sviluppatori stanchi delle agende di carta.\n\n' +
          'Oggi la nostra piattaforma gestisce le prenotazioni di oltre tremila studi medici. Lavoriamo in piccoli team, scriviamo le decisioni e rilasciamo spesso.',
      ),
    },
    {
      id: 'numeri',
      type: 'numbers',
      items: [
        { value: '42', label: it('persone nel team') },
        { value: '3.000+', label: it('studi che ci usano') },
        { value: '2016', label: it('anno di fondazione') },
        { value: '5 giorni', label: it('per rispondere a ogni candidatura') },
      ],
    },
    {
      id: 'valori',
      type: 'values',
      title: it('Cosa offriamo'),
      items: [
        { icon: 'house', title: it('Lavoro ibrido'), text: it('Due giorni in ufficio, il resto da dove preferisci.') },
        { icon: 'graduation-cap', title: it('Formazione'), text: it('1.500 € l’anno a testa, più conferenze e libri.') },
        { icon: 'heart', title: it('Salute'), text: it('Assicurazione sanitaria integrativa anche per la famiglia.') },
        { icon: 'clock', title: it('Orario flessibile'), text: it('Inizio tra le 8 e le 10, niente riunioni il venerdì pomeriggio.') },
      ],
    },
    {
      id: 'come-selezioniamo',
      type: 'text',
      title: it('Come selezioniamo'),
      body: it(
        'Ogni annuncio elenca le fasi, chi le conduce e quanto durano. Dopo ogni fase ricevi una risposta entro i giorni indicati, anche quando non è quella che speravi.\n\n' +
          'Nessun algoritmo decide al posto nostro: ogni candidatura la legge una persona.',
      ),
    },
    {
      id: 'persone',
      type: 'testimonials',
      title: it('Chi lavora qui'),
      items: [
        {
          quote: it('Al colloquio sapevo già lo stipendio e quante fasi mi aspettavano. Dopo due anni, il modo di lavorare è rimasto lo stesso.'),
          name: 'Giada Rinaldi',
          role: it('Frontend developer'),
        },
      ],
    },
    { id: 'posizioni', type: 'jobs', title: it('Posizioni aperte'), intro: it('Rispondiamo a ogni candidatura entro i giorni indicati nell’annuncio.') },
  ],
});
