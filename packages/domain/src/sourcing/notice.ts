import type { Locale } from '../platform/config.js';
import type { SourcingSource } from './sourcing.js';

/** The public page a sourced person opens from their notice: what is kept about them, and "erase and do not contact me". */
export const sourcingNoticePath = (secret: string): string => `/sourcing/notice/${encodeURIComponent(secret)}`;

export interface SourcingNoticeInput {
  readonly locale: Locale;
  readonly firstName: string;
  readonly organizationName: string;
  readonly jobTitle: string;
  readonly source: SourcingSource;
  readonly link: string;
  readonly expiresAt: Date;
  readonly timeZone?: string | undefined;
  /** A few lines to paste into a first message (LinkedIn, email) instead of the full email. */
  readonly short?: boolean | undefined;
}

const SOURCE_NAME: Readonly<Record<Locale, Readonly<Record<SourcingSource, string>>>> = {
  it: { linkedin: 'profilo pubblico LinkedIn', github: 'profilo pubblico GitHub', web: 'pagina web pubblica', manual: 'profilo pubblico' },
  en: { linkedin: 'public LinkedIn profile', github: 'public GitHub profile', web: 'public web page', manual: 'public profile' },
};

const dateOf = (date: Date, locale: Locale, timeZone = 'UTC'): string => new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'long', timeZone }).format(date);

/**
 * The GDPR art. 14 information for a person found outside the platform: who holds the data (the organization), where it
 * came from, why (one position), what (name, title, location, the profile link and what fits the role), until when, and
 * the personal link to see it all and have it erased (which also stops any contact). Plain text; never a score.
 */
export function buildSourcingNotice(input: SourcingNoticeInput): { readonly subject: string; readonly text: string } {
  const { firstName, organizationName: org, jobTitle: job, link } = input;
  const source = SOURCE_NAME[input.locale][input.source];
  const until = dateOf(input.expiresAt, input.locale, input.timeZone);
  if (input.locale === 'it') {
    if (input.short) return { subject: '', text: `Informativa privacy: ${org} ha preso i tuoi dati dal tuo ${source} per la posizione ${job} e li cancella entro il ${until} se non rispondi. Dettagli e cancellazione: ${link}` };
    return {
      subject: `${org} ha trovato il tuo profilo per la posizione ${job}`,
      text: [
        `Ciao ${firstName},`,
        `${org} ha trovato il tuo ${source} e pensa che potresti essere interessato alla posizione ${job}. Non ti sei candidato: per questo ti scriviamo, come chiede il GDPR (art. 14).`,
        `Cosa teniamo: nome, ruolo, città, il link al profilo e quello che nel profilo riguarda la posizione. Solo per valutare se proporti questa posizione. Nessun punteggio, nessuna decisione automatica.`,
        `Fino a quando: se non rispondi, i tuoi dati vengono cancellati entro il ${until}.`,
        `Da qui vedi tutto quello che teniamo e puoi farlo cancellare subito; in quel caso ${org} si impegna a non ricontattarti: ${link}`,
      ].join('\n\n'),
    };
  }
  if (input.short) return { subject: '', text: `Privacy notice: ${org} took your data from your ${source} for the ${job} role and erases it by ${until} unless you reply. Details and erasure: ${link}` };
  return {
    subject: `${org} found your profile for the ${job} role`,
    text: [
      `Hi ${firstName},`,
      `${org} found your ${source} and thinks you may be interested in the ${job} role. You did not apply: this is why we write to you, as the GDPR asks (art. 14).`,
      `What we keep: name, title, location, the link to the profile and what in it relates to the role. Only to consider offering you this role. No score, no automated decision.`,
      `Until when: if you do not reply, your data is erased by ${until}.`,
      `Here you can see everything we keep and have it erased at once; ${org} will then not be able to contact you again: ${link}`,
    ].join('\n\n'),
  };
}
