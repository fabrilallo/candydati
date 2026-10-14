import { textToHtml } from '../messaging/html.js';
import { isRole } from '../access/permissions.js';
import { isLocale, type Locale } from '../platform/config.js';

/**
 * Emails about a person's own account: confirm the address, reset the password, join an organization, failed
 * sign-ins. Pure: the api sends them through the configured EmailProvider. They never contain a password or a
 * session, only single-use links.
 */
interface Common {
  readonly locale: Locale;
  readonly platformName: string;
  readonly link: string;
}

export type AccountEmailInput =
  | (Common & { readonly kind: 'verify_email'; readonly userName: string })
  | (Common & { readonly kind: 'reset_password'; readonly userName: string })
  | (Common & { readonly kind: 'existing_account'; readonly userName: string })
  | (Common & {
      readonly kind: 'invitation';
      readonly organizationName: string;
      readonly inviterName: string;
      readonly roleLabel: string;
    })
  | (Common & { readonly kind: 'sign_in_failures'; readonly userName: string; readonly failures: number });

export type AccountEmailKind = AccountEmailInput['kind'];

export interface AccountEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

type Copy = { readonly subject: string; readonly paragraphs: readonly string[] };

function italian(input: AccountEmailInput): Copy {
  switch (input.kind) {
    case 'verify_email':
      return {
        subject: `Conferma il tuo indirizzo email per ${input.platformName}`,
        paragraphs: [
          `Ciao ${input.userName},`,
          `per attivare l'account conferma che questo indirizzo è tuo: ${input.link}`,
          'Il link vale 24 ore e si può usare una volta sola. Se non hai creato tu l\'account, ignora questa email.',
        ],
      };
    case 'reset_password':
      return {
        subject: `Reimposta la password di ${input.platformName}`,
        paragraphs: [
          `Ciao ${input.userName},`,
          `abbiamo ricevuto una richiesta di reimpostare la password. Scegline una nuova qui: ${input.link}`,
          'Il link vale 1 ora e si può usare una volta sola; dopo il cambio tutte le sessioni aperte vengono chiuse. Se non l\'hai chiesto tu, ignora questa email: la password resta quella di prima.',
        ],
      };
    case 'existing_account':
      return {
        subject: `Hai già un account su ${input.platformName}`,
        paragraphs: [
          `Ciao ${input.userName},`,
          'qualcuno (forse tu) ha provato a creare un nuovo account con questo indirizzo, che ne ha già uno.',
          `Se hai dimenticato la password, reimpostala qui: ${input.link}`,
          'Se non eri tu, ignora questa email: il tuo account non è cambiato.',
        ],
      };
    case 'invitation':
      return {
        subject: `${input.inviterName} ti invita in ${input.organizationName}`,
        paragraphs: [
          `${input.inviterName} ti ha invitato a entrare in ${input.organizationName} su ${input.platformName} come ${input.roleLabel}.`,
          `Per accettare apri questo link: ${input.link}`,
          'Per accettare serve un account con questo stesso indirizzo email, confermato. L\'invito scade dopo 7 giorni. Se non te lo aspettavi, ignora questa email.',
        ],
      };
    case 'sign_in_failures':
      return {
        subject: `Tentativi di accesso non riusciti su ${input.platformName}`,
        paragraphs: [
          `Ciao ${input.userName},`,
          `ci sono stati ${input.failures} tentativi di accesso non riusciti al tuo account negli ultimi minuti. Se eri tu, non devi fare nulla.`,
          `Se non eri tu, la password ha retto; per sicurezza puoi cambiarla qui: ${input.link}`,
        ],
      };
  }
}

function english(input: AccountEmailInput): Copy {
  switch (input.kind) {
    case 'verify_email':
      return {
        subject: `Confirm your email address for ${input.platformName}`,
        paragraphs: [
          `Hi ${input.userName},`,
          `to activate your account, confirm this address is yours: ${input.link}`,
          'The link is valid for 24 hours and works once. If you did not create the account, ignore this email.',
        ],
      };
    case 'reset_password':
      return {
        subject: `Reset your ${input.platformName} password`,
        paragraphs: [
          `Hi ${input.userName},`,
          `we received a request to reset your password. Choose a new one here: ${input.link}`,
          'The link is valid for 1 hour and works once; after the change every open session is signed out. If you did not ask for it, ignore this email: your password stays the same.',
        ],
      };
    case 'existing_account':
      return {
        subject: `You already have a ${input.platformName} account`,
        paragraphs: [
          `Hi ${input.userName},`,
          'someone (perhaps you) tried to create a new account with this address, which already has one.',
          `If you forgot your password, reset it here: ${input.link}`,
          'If it was not you, ignore this email: your account has not changed.',
        ],
      };
    case 'invitation':
      return {
        subject: `${input.inviterName} invited you to ${input.organizationName}`,
        paragraphs: [
          `${input.inviterName} invited you to join ${input.organizationName} on ${input.platformName} as ${input.roleLabel}.`,
          `To accept, open this link: ${input.link}`,
          'Accepting needs a confirmed account with this same email address. The invitation expires after 7 days. If you were not expecting it, ignore this email.',
        ],
      };
    case 'sign_in_failures':
      return {
        subject: `Failed sign-in attempts on ${input.platformName}`,
        paragraphs: [
          `Hi ${input.userName},`,
          `there were ${input.failures} failed attempts to sign in to your account in the last few minutes. If it was you, there is nothing to do.`,
          `If it was not you, your password held; to be safe you can change it here: ${input.link}`,
        ],
      };
  }
}

/** Subject, plain text and HTML (escaped, only the link becomes an anchor) of an account email. */
export function buildAccountEmail(input: AccountEmailInput): AccountEmail {
  const copy = input.locale === 'it' ? italian(input) : english(input);
  const text = copy.paragraphs.join('\n\n');
  return { subject: copy.subject, text, html: textToHtml(text) };
}

/** First supported language of an Accept-Language header, or the fallback. */
export function pickLocale(acceptLanguage: string | null | undefined, fallback: Locale): Locale {
  const languages = (acceptLanguage ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim().slice(0, 2).toLowerCase() ?? '')
    .filter((language) => language !== '');
  return languages.find(isLocale) ?? fallback;
}

const ROLE_LABELS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  it: { owner: 'proprietario', admin: 'amministratore', recruiter: 'recruiter', hiring_manager: 'hiring manager', interviewer: 'intervistatore' },
  en: { owner: 'owner', admin: 'admin', recruiter: 'recruiter', hiring_manager: 'hiring manager', interviewer: 'interviewer' },
};

/** Role name for the invitation email; an unknown role is shown as stored. */
export const roleLabel = (role: string, locale: Locale): string => (isRole(role) ? (ROLE_LABELS[locale][role] ?? role) : role);
