import type { Locale } from '../platform/config.js';
import { IMPORT_RECONFIRM_DAYS } from './import.js';

/**
 * Stands for the consent link in a stored reconfirmation message. The link carries a single-use secret, so it is never
 * stored: the delivery puts a fresh one in at send time (`renderConsentLink`) and keeps only its hash.
 */
export const CONSENT_LINK = '{{consent_link}}';

/** The body to send: the placeholder replaced by the link. */
export const renderConsentLink = (body: string, url: string): string => body.split(CONSENT_LINK).join(url);

/** A system message holding the placeholder is a reconfirmation request. */
export const isConsentRequestBody = (body: string): boolean => body.includes(CONSENT_LINK);

export interface ReconfirmEmailInput {
  readonly language: Locale;
  readonly firstName: string;
  readonly organizationName: string;
  readonly jobTitle: string;
  /** Public link `/consent/{token}`, or `CONSENT_LINK` for a message stored before sending. */
  readonly url: string;
}

export interface ReconfirmEmail {
  readonly subject: string;
  readonly body: string;
}

/**
 * The system email that asks an imported candidate to reconfirm consent (PRODUCT.md §6). Plain text, in the language of the
 * ad. It says why they are written to, what happens if they do nothing and how to say no.
 */
export function reconfirmEmail(input: ReconfirmEmailInput): ReconfirmEmail {
  const { firstName, organizationName: org, jobTitle, url } = input;
  const name = firstName.trim() === '' ? '' : ` ${firstName.trim()}`;
  if (input.language === 'en') {
    return {
      subject: `${org}: please confirm you want us to keep your data`,
      body: `Hello${name},

${org} has your details and your CV from a previous selection, and we have added them to the process for ${jobTitle}. You have not yet told us whether you agree to this, so we need your confirmation.

Please read the privacy notice and choose what you agree to here:
${url}

If you do nothing, your data and your CV will be deleted automatically within ${IMPORT_RECONFIRM_DAYS} days. You can also decline from the same page, and everything is deleted at once.

${org}`,
    };
  }
  return {
    subject: `${org}: conferma che possiamo conservare i tuoi dati`,
    body: `Ciao${name},

${org} ha i tuoi dati e il tuo CV da una selezione precedente e li ha inseriti nel processo per ${jobTitle}. Non ci hai ancora detto se sei d'accordo, quindi ci serve la tua conferma.

Leggi l'informativa sulla privacy e scegli a cosa acconsenti da qui:
${url}

Se non fai nulla, i tuoi dati e il tuo CV verranno cancellati automaticamente entro ${IMPORT_RECONFIRM_DAYS} giorni. Dalla stessa pagina puoi anche rifiutare: in quel caso cancelliamo tutto subito.

${org}`,
  };
}
