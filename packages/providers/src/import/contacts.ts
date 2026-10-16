import { trimTrailing } from '@candydati/domain';

export type NameConfidence = 'high' | 'medium' | 'low';

export interface ExtractedContacts {
  readonly email: string | null;
  /** Normalised: digits with a leading `+` (Italian national numbers get `+39`). */
  readonly phones: readonly string[];
  readonly linkedin: string | null;
  readonly fullName: { readonly value: string; readonly confidence: NameConfidence } | null;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[A-Za-z]{2,}/gu;
/** Every character an address can hold: an address always sits inside one run of them. */
const EMAIL_RUN = /[\p{L}\p{N}._%+@-]+/gu;
/** A longer run is not an address (RFC 5321 caps one at 254): the address pattern only ever sees short strings. */
const EMAIL_RUN_MAX = 320;
const EMAIL_REJECT = /^(no-?reply|donotreply|example|test)@|@(example\.(com|org)|domain\.com|email\.com)$|\.(png|jpe?g|gif|svg|webp)$/i;
const INTERNATIONAL = /(?<![\d+])(?:\+|00)\d{1,3}[\s.()-]{0,2}\d(?:[\s.()-]{0,2}\d){6,12}(?!\d)/g;
const IT_MOBILE = /(?<![\d+])3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)/g;
const IT_LANDLINE = /(?<![\d+])0\d{1,3}[\s.-]?\d{5,8}(?!\d)/g;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/([\p{L}\p{N}_%.-]+)/giu;
const LABEL = /^(?:nome e cognome|full name|name|nome|candidato|candidate)\s*[:-]\s*/i;
const PARTICLES = new Set(['de', 'di', 'da', 'del', 'della', 'dei', 'dal', 'dalla', 'degli', 'van', 'von', 'der', 'den', 'la', 'le', 'lo', 'mc', 'mac', 'el', 'al', 'bin', 'ben']);
const NOT_A_NAME =
  /(curriculum|vitae|resume|résumé|\bcv\b|profile|profilo|summary|contact|contatti|europass|esperienz|experience|education|istruzione|formazione|skills|competenze|address|indirizzo|developer|engineer|manager|designer|analyst|consultant|sviluppatore|ingegnere|responsabile|specialist|laurea|università|university|obiettivo|pagina|page|telefono|phone|email|linkedin)/i;
const TOKEN = /^[\p{Lu}][\p{L}'’.-]*$/u;
const NAME_SCAN_LINES = 8;
const PHONE_DIGITS = { min: 8, max: 15 } as const;

/** Addresses in reading order, searched run by run: linear on any text, where one pass of `EMAIL` is quadratic. */
function emails(text: string): readonly string[] {
  return [...text.matchAll(EMAIL_RUN)].flatMap(([run]) => (run.length <= EMAIL_RUN_MAX && run.includes('@') ? (run.match(EMAIL) ?? []) : []));
}

/** The text with every address blanked out, found the same way. */
const withoutEmails = (text: string): string =>
  text.replace(EMAIL_RUN, (run) => (run.length <= EMAIL_RUN_MAX && run.includes('@') ? run.replace(EMAIL, ' ') : run));

function firstEmail(text: string): string | null {
  const found = emails(text).find((email) => !EMAIL_REJECT.test(email));
  return found ? found.toLowerCase() : null;
}

function normalisePhone(raw: string, italian: boolean): string | null {
  const digits = raw.replace(/\D/g, '');
  const international = raw.trim().startsWith('+') ? digits : digits.startsWith('00') ? digits.slice(2) : italian ? `39${digits}` : digits;
  return international.length >= PHONE_DIGITS.min && international.length <= PHONE_DIGITS.max ? `+${international}` : null;
}

function phoneNumbers(text: string): readonly string[] {
  const scoped = withoutEmails(text);
  const results: string[] = [];
  const consumed = scoped.replace(INTERNATIONAL, (raw) => {
    const phone = normalisePhone(raw, false);
    if (phone) results.push(phone);
    return ' ';
  });
  for (const pattern of [IT_MOBILE, IT_LANDLINE]) {
    for (const match of consumed.matchAll(pattern)) {
      const phone = normalisePhone(match[0], true);
      if (phone) results.push(phone);
    }
  }
  return [...new Set(results)];
}

function linkedinUrl(text: string): string | null {
  const match = [...text.matchAll(LINKEDIN)][0];
  const slug = match?.[1] === undefined ? undefined : trimTrailing(match[1], '.,;)');
  return slug ? `https://www.linkedin.com/in/${slug}` : null;
}

const titleCase = (token: string): string => (token === token.toUpperCase() ? token.charAt(0) + token.slice(1).toLowerCase() : token);

function nameFromLine(rawLine: string): string | null {
  const line = rawLine.replace(LABEL, '').trim();
  if (line === '' || /[\d@:/|]/.test(line) || NOT_A_NAME.test(line)) return null;
  const tokens = line.split(/\s+/);
  const valid = tokens.every((token) => TOKEN.test(token) || PARTICLES.has(token.toLowerCase()));
  const capitalised = tokens.filter((token) => TOKEN.test(token));
  if (!valid || tokens.length < 2 || tokens.length > 4 || capitalised.length < 2) return null;
  return tokens.map((token) => (PARTICLES.has(token.toLowerCase()) ? token.toLowerCase() : titleCase(token))).join(' ');
}

function probableName(text: string): ExtractedContacts['fullName'] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, NAME_SCAN_LINES);
  for (const [index, line] of lines.entries()) {
    const value = nameFromLine(line);
    if (!value) continue;
    const labelled = LABEL.test(line);
    const confidence: NameConfidence = labelled || index === 0 ? 'high' : index < 3 ? 'medium' : 'low';
    return { value, confidence };
  }
  return null;
}

/** Email, phones, LinkedIn URL and a probable full name; nothing else is ever read from the text. */
export function extractContacts(text: string): ExtractedContacts {
  return { email: firstEmail(text), phones: phoneNumbers(text), linkedin: linkedinUrl(text), fullName: probableName(text) };
}
