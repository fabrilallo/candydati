import type { Locale } from '../platform/config.js';
import { interviewPath, type InterviewMode } from './interview.js';

/**
 * The texts of interview emails. The invitation is stored with placeholders, never with its link: the delivery puts a
 * fresh secret in at send time and keeps only its hash (as the consent link does).
 */

const LINK = /\{\{interview_link:([A-Za-z0-9_-]{1,64})\}\}/;
const SLOT = /\{\{interview_slot:([A-Za-z0-9_-]{1,64}):([0-9T:.\-Z]{20,30})\}\}/g;

export const interviewLinkPlaceholder = (interviewId: string): string => `{{interview_link:${interviewId}}}`;
export const interviewSlotPlaceholder = (interviewId: string, slot: Date): string => `{{interview_slot:${interviewId}:${slot.toISOString()}}}`;

/** The interview a stored invitation is for, or null for any other message. */
export function interviewOfBody(body: string): string | null {
  return LINK.exec(body)?.[1] ?? null;
}

/** The body to send: the placeholders replaced by the page link and the links of the times it offers. */
export function renderInterviewLinks(body: string, interviewId: string, baseUrl: string, secret: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return body
    .split(interviewLinkPlaceholder(interviewId))
    .join(`${base}${interviewPath(secret)}`)
    .replace(SLOT, (whole, id: string, iso: string) => {
      const slot = new Date(iso);
      return id === interviewId && !Number.isNaN(slot.getTime()) ? `${base}${interviewPath(secret, slot)}` : whole;
    });
}

const MODES: Readonly<Record<Locale, Readonly<Record<InterviewMode, string>>>> = {
  it: { video: 'in videochiamata', onsite: 'in sede', phone: 'al telefono' },
  en: { video: 'by video call', onsite: 'on site', phone: 'by phone' },
};

/** "lunedì 16 novembre, 10:00 (ora di Roma)": what a person reads in an email, in a stated time zone. */
export function formatInterviewTime(start: Date, locale: Locale, timeZone: string): string {
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(start);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(start);
  const zone = new Intl.DateTimeFormat(locale, { timeZoneName: 'long', timeZone }).formatToParts(start).find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  return `${day}, ${time} (${zone})`;
}

export interface InvitationInput {
  readonly locale: Locale;
  readonly interviewId: string;
  readonly firstName: string;
  readonly organizationName: string;
  readonly jobTitle: string;
  readonly stageLabel: string;
  readonly durationMinutes: number;
  readonly mode: InterviewMode;
  /** The times the email offers (each a link to the page with that time chosen); may be empty. */
  readonly slots: readonly Date[];
  readonly timeZone: string;
}

/** Subject and body with placeholders, to store as the message. */
export function buildInterviewInvitation(input: InvitationInput): { readonly subject: string; readonly text: string } {
  const times = input.slots.map((slot) => `- ${formatInterviewTime(slot, input.locale, input.timeZone)}: ${interviewSlotPlaceholder(input.interviewId, slot)}`);
  const link = interviewLinkPlaceholder(input.interviewId);
  const mode = MODES[input.locale][input.mode];
  if (input.locale === 'it') {
    return {
      subject: `Colloquio per ${input.jobTitle}: scegli quando`,
      text: [
        `Ciao ${input.firstName},`,
        `${input.organizationName} vorrebbe incontrarti per ${input.jobTitle} (${input.stageLabel}): ${input.durationMinutes} minuti, ${mode}.`,
        ...(times.length > 0 ? [`Ecco alcuni orari liberi, apri quello che preferisci e conferma:\n${times.join('\n')}`] : []),
        `Tutti gli orari liberi sono qui, senza account: ${link}`,
        'Dopo la conferma ricevi un invito da aggiungere al calendario. Se nessun orario va bene, rispondi a questa email.',
      ].join('\n\n'),
    };
  }
  return {
    subject: `Interview for ${input.jobTitle}: choose a time`,
    text: [
      `Hi ${input.firstName},`,
      `${input.organizationName} would like to meet you for ${input.jobTitle} (${input.stageLabel}): ${input.durationMinutes} minutes, ${mode}.`,
      ...(times.length > 0 ? [`Here are some free times, open the one you prefer and confirm:\n${times.join('\n')}`] : []),
      `Every free time is here, with no account: ${link}`,
      'After you confirm you get an invite for your calendar. If no time works, reply to this email.',
    ].join('\n\n'),
  };
}

export type InterviewNoticeKind = 'booked' | 'rescheduled' | 'cancelled' | 'reminder';

export interface InterviewNoticeInput {
  readonly locale: Locale;
  readonly kind: InterviewNoticeKind;
  /** Who reads it: the candidate's first name, or the interviewer's name. */
  readonly recipientName: string;
  /** For interviewers only: who they meet. */
  readonly candidateName: string | null;
  readonly organizationName: string;
  readonly jobTitle: string;
  readonly stageLabel: string;
  readonly start: Date;
  readonly durationMinutes: number;
  readonly mode: InterviewMode;
  readonly location: string | null;
  readonly timeZone: string;
  /** For the candidate: the page to move or cancel. */
  readonly manageLink: string | null;
}

const HEAD: Readonly<Record<Locale, Readonly<Record<InterviewNoticeKind, string>>>> = {
  it: { booked: 'Colloquio confermato', rescheduled: 'Colloquio spostato', cancelled: 'Colloquio annullato', reminder: 'Promemoria colloquio' },
  en: { booked: 'Interview confirmed', rescheduled: 'Interview moved', cancelled: 'Interview cancelled', reminder: 'Interview reminder' },
};

/** The email that carries the .ics: to the candidate, or to an interviewer. */
export function buildInterviewNotice(input: InterviewNoticeInput): { readonly subject: string; readonly text: string } {
  const when = formatInterviewTime(input.start, input.locale, input.timeZone);
  const mode = MODES[input.locale][input.mode];
  const it = input.locale === 'it';
  const who = input.candidateName ? (it ? ` con ${input.candidateName}` : ` with ${input.candidateName}`) : '';
  const subject = `${HEAD[input.locale][input.kind]}: ${input.jobTitle}${who}, ${when}`;
  const where = input.location ? [it ? `Dove: ${input.location}` : `Where: ${input.location}`] : [];
  const change = input.manageLink && input.kind !== 'cancelled' ? [it ? `Per spostarlo o annullarlo: ${input.manageLink}` : `To move or cancel it: ${input.manageLink}`] : [];
  const lines = it
    ? [
        `Ciao ${input.recipientName},`,
        input.kind === 'cancelled'
          ? `il colloquio${who} per ${input.jobTitle} (${input.stageLabel}) di ${when} è annullato.`
          : `il colloquio${who} per ${input.jobTitle} (${input.stageLabel}) è ${{ booked: 'fissato a', rescheduled: 'spostato a', reminder: 'confermato per' }[input.kind]} ${when}: ${input.durationMinutes} minuti, ${mode}.`,
        ...where,
        ...change,
        { cancelled: 'L’evento sparisce dal calendario.', reminder: 'Per spostarlo o annullarlo usa il link dell’email di conferma, fino a 12 ore prima.', booked: 'In allegato l’invito per il calendario.', rescheduled: 'In allegato l’invito per il calendario.' }[input.kind],
      ]
    : [
        `Hi ${input.recipientName},`,
        input.kind === 'cancelled'
          ? `the interview${who} for ${input.jobTitle} (${input.stageLabel}) on ${when} is cancelled.`
          : `the interview${who} for ${input.jobTitle} (${input.stageLabel}) is ${{ booked: 'set for', rescheduled: 'moved to', reminder: 'still on for' }[input.kind]} ${when}: ${input.durationMinutes} minutes, ${mode}.`,
        ...where,
        ...change,
        { cancelled: 'The event leaves your calendar.', reminder: 'To move or cancel it, use the link in the confirmation email, until 12 hours before.', booked: 'The calendar invite is attached.', rescheduled: 'The calendar invite is attached.' }[input.kind],
      ];
  return { subject, text: lines.join('\n\n') };
}
