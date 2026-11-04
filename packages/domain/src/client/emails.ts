import type { Locale } from '../platform/config.js';

const dateOf = (date: Date, locale: Locale, timeZone = 'UTC'): string => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(date);

export interface ShortlistEmailInput {
  readonly locale: Locale;
  readonly recipientName: string;
  readonly agencyName: string;
  readonly jobTitle: string;
  readonly candidateCount: number;
  readonly message: string | null;
  readonly link: string;
  readonly expiresAt: Date;
  readonly reminder: boolean;
  readonly timeZone?: string | undefined;
}

export interface PlainEmail {
  readonly subject: string;
  readonly text: string;
}

/** The link to the client contact. It names no candidate: the names are behind the link, not in a forwarded mailbox. */
export function buildShortlistEmail(input: ShortlistEmailInput): PlainEmail {
  const { recipientName, agencyName, jobTitle, candidateCount, link } = input;
  const until = dateOf(input.expiresAt, input.locale, input.timeZone);
  if (input.locale === 'it') {
    return {
      subject: `${input.reminder ? 'Promemoria: ' : ''}${agencyName} ti presenta ${candidateCount === 1 ? 'un candidato' : `${candidateCount} candidati`} per ${jobTitle}`,
      text: [
        `Ciao ${recipientName},`,
        `${agencyName} ti presenta ${candidateCount === 1 ? 'un candidato' : `${candidateCount} candidati`} per la posizione ${jobTitle}.`,
        ...(input.message ? [input.message] : []),
        `Apri la shortlist, senza account: ${link}`,
        `Per ogni candidato puoi rispondere "Incontriamolo" o "Non fa per noi", con un breve motivo. La decisione resta a una persona: nessuna risposta sposta il candidato in automatico.`,
        `Il link è personale e vale fino al ${until}${input.reminder ? '; sostituisce quello ricevuto prima' : ''}. Non inoltrarlo. I dati dei candidati ti sono mostrati solo per questa selezione: non conservarli e non usarli per altro.`,
      ].join('\n\n'),
    };
  }
  return {
    subject: `${input.reminder ? 'Reminder: ' : ''}${agencyName} presents ${candidateCount === 1 ? 'a candidate' : `${candidateCount} candidates`} for ${jobTitle}`,
    text: [
      `Hi ${recipientName},`,
      `${agencyName} presents ${candidateCount === 1 ? 'a candidate' : `${candidateCount} candidates`} for the ${jobTitle} position.`,
      ...(input.message ? [input.message] : []),
      `Open the shortlist, with no account: ${link}`,
      `For each candidate you can answer "Let's meet" or "Not for us", with a short reason. A person decides: no answer moves a candidate automatically.`,
      `The link is personal and valid until ${until}${input.reminder ? '; it replaces the one you received before' : ''}. Do not forward it. Candidate data is shown to you for this search only: do not keep it or use it for anything else.`,
    ].join('\n\n'),
  };
}

export interface ProfileSharedNoticeInput {
  readonly locale: Locale;
  readonly candidateFirstName: string;
  readonly agencyName: string;
  readonly jobTitle: string;
  /** Null when the client is confidential. */
  readonly clientName: string | null;
  readonly sharedCv: boolean;
  readonly sharedNotes: boolean;
}

const sharedItemsIt = (cv: boolean, notes: boolean): string =>
  ['nome e cognome', ...(cv ? ['il curriculum'] : []), ...(notes ? ['alcune note del recruiter sul tuo profilo'] : [])].join(', ');
const sharedItemsEn = (cv: boolean, notes: boolean): string =>
  ['your name', ...(cv ? ['your CV'] : []), ...(notes ? ["some of the recruiter's notes on your profile"] : [])].join(', ');

/**
 * Tells the candidate their profile was shown to a client (PRODUCT.md §2.3, §6): who it went to (or that the client is
 * confidential, and that they may ask which company it is), what was shared, and that no decision is automatic.
 */
export function buildProfileSharedNotice(input: ProfileSharedNoticeInput): PlainEmail {
  const { candidateFirstName, agencyName, jobTitle, clientName } = input;
  if (input.locale === 'it') {
    const recipient = clientName ?? `un'azienda cliente di ${agencyName}, che per ora ha chiesto di restare riservata`;
    return {
      subject: `Il tuo profilo per ${jobTitle} è stato presentato ${clientName ? `a ${clientName}` : "all'azienda cliente"}`,
      text: [
        `Ciao ${candidateFirstName},`,
        `ti scriviamo per trasparenza: per la selezione ${jobTitle}, ${agencyName} ha presentato il tuo profilo a ${recipient}.`,
        `Abbiamo condiviso: ${sharedItemsIt(input.sharedCv, input.sharedNotes)}. Nessun contatto (email o telefono) e nessun dato di altre candidature.`,
        `L'azienda ci dirà se vuole incontrarti; in ogni caso riceverai una risposta da una persona di ${agencyName}. Nessuna decisione su di te viene presa in modo automatico.`,
        `${clientName ? '' : "Se vuoi sapere a quale azienda è stato presentato il profilo, rispondi a questa email. "}Per domande o per esercitare i tuoi diritti sui dati personali (accesso, rettifica, cancellazione, opposizione) rispondi a questa email.`,
      ].join('\n\n'),
    };
  }
  const recipient = clientName ?? `a client company of ${agencyName}, which asked to stay confidential for now`;
  return {
    subject: `Your profile for ${jobTitle} was presented to ${clientName ?? 'the client company'}`,
    text: [
      `Hi ${candidateFirstName},`,
      `we are writing to keep you informed: for the ${jobTitle} search, ${agencyName} presented your profile to ${recipient}.`,
      `We shared: ${sharedItemsEn(input.sharedCv, input.sharedNotes)}. No contact details (email or phone) and nothing about other applications.`,
      `The company will tell us whether it would like to meet you; either way you will hear back from a person at ${agencyName}. No decision about you is made automatically.`,
      `${clientName ? '' : 'If you would like to know which company it is, reply to this email. '}For questions, or to exercise your rights over your personal data (access, correction, erasure, objection), reply to this email.`,
    ].join('\n\n'),
  };
}
