import { z } from 'zod';
import { httpUrlSchema } from '../url/http-url.js';
import type { SourcingEvidence } from './sourcing.js';

/** The WHATWG URL parser, present in browsers and Node; declared here because this package loads no DOM or Node types. */
declare const URL: new (input: string) => { readonly hostname: string; readonly pathname: string };

/**
 * Web search through the recruiter's own browser (the Candydati extension opens Google there): public pages only, read
 * from the results page itself (title, link, snippet), never the pages behind them. At most MAX_WEB_RESULTS a search.
 */
export const MAX_WEB_RESULTS = 30;
export const WEB_QUERY_MAX = 200;

/** One organic Google result as the extension read it. */
export const webResultSchema = z
  .object({
    url: httpUrlSchema.max(500),
    title: z.string().trim().min(1).max(300),
    snippet: z.string().trim().max(1000).default(''),
  })
  .strict();
export type WebResult = z.output<typeof webResultSchema>;

/** A person a result points to, before the organization's checks. `handle` is the LinkedIn or GitHub one, if any. */
export interface WebPerson {
  readonly source: 'linkedin' | 'github' | 'web';
  readonly firstName: string;
  readonly lastName: string | null;
  readonly headline: string | null;
  readonly location: string | null;
  readonly profileUrl: string;
  readonly handle: string | null;
}

/** The neutral first name of a GitHub account that shows no name: never the login. */
export const UNNAMED_GITHUB = 'GitHub user';
const EVIDENCE_WHERE = 'Google result';
const CRITERION_MAX = 80;
const SNIPPET_MAX = 500;
const LOCATION_MAX = 120;

/** GitHub paths of one segment that are GitHub's own pages, not accounts. */
const GITHUB_RESERVED = new Set(['about', 'apps', 'collections', 'contact', 'customer-stories', 'enterprise', 'events', 'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'resources', 'search', 'security', 'settings', 'site', 'solutions', 'sponsors', 'team', 'topics', 'trending', 'users']);
/** Lowercase words that belong to a surname ("De Santis", "van der Berg"). */
const PARTICLES = new Set(['da', 'de', 'dei', 'del', 'della', 'der', 'di', 'du', 'la', 'le', 'van', 'von']);
/** Words a page or job title has and a person's name does not ("Senior Backend Engineer - Acme Careers"). */
const NOT_A_NAME = new Set(['about', 'backend', 'careers', 'carriere', 'developer', 'engineer', 'frontend', 'home', 'jobs', 'junior', 'lavora', 'lavoro', 'manager', 'offerte', 'our', 'senior', 'sviluppatore', 'sviluppatrice', 'team', 'the']);
/** Title separators, each one a word of its own: "Name - Headline | LinkedIn". */
const SEPARATORS = new Set(['-', '–', '—', '|', '·']);
const LOCATION_LABELS = ['location', 'località', 'posizione', 'ubicazione'];
const LOCATION_ENDS = ['·', '|', '\n'];

const parse = (value: string): { readonly host: string; readonly segments: readonly string[] } | null => {
  if (!httpUrlSchema.safeParse(value).success) return null;
  const url = new URL(value);
  return { host: url.hostname.toLowerCase().replace(/^www\./, ''), segments: url.pathname.split('/').filter(Boolean) };
};

const splitName = (name: string): { firstName: string; lastName: string | null } => {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') || null };
};

/**
 * The words of a title split at the separators that stand alone ("Giulia Verdi - Backend Engineer"), with no regular
 * expression that could backtrack: titles come from web pages. A trailing `suffix` part ("LinkedIn") is dropped.
 */
const titleSegments = (title: string, suffix: string | null): string[][] => {
  const segments = title.split(/\s/).filter(Boolean).reduce<string[][]>((acc, word) => (SEPARATORS.has(word) ? [...acc, []] : [...acc.slice(0, -1), [...(acc.at(-1) ?? []), word]]), [[]]);
  const last = segments.at(-1)?.join(' ').toLowerCase();
  return suffix !== null && segments.length > 1 && last === suffix ? segments.slice(0, -1) : segments;
};

/** "Giulia Verdi - Backend Engineer - Acme | LinkedIn": the name (credentials after a comma left out) and the rest. */
const titleParts = (title: string, suffix: string | null = null): { name: string; headline: string | null } => {
  const [name = [], ...rest] = titleSegments(title, suffix);
  return { name: name.join(' ').split(',')[0]?.trim() ?? '', headline: rest.map((part) => part.join(' ')).filter(Boolean).join(' - ') || null };
};

/** Where the label ends when a colon follows it, spaces allowed in between ("Località : …"); -1 otherwise. */
const afterLabel = (text: string, at: number, label: string): number => {
  let index = at + label.length;
  while (text[index] === ' ') index += 1;
  return text[index] === ':' ? index + 1 : -1;
};

/** "Località: Torino · …": the text after the label up to the next separator, found with indexOf only. */
const locationIn = (snippet: string): string | null => {
  const lower = snippet.toLowerCase();
  const starts = LOCATION_LABELS.flatMap((label) => {
    const at = lower.indexOf(label);
    const from = at < 0 ? -1 : afterLabel(lower, at, label);
    return from < 0 ? [] : [from];
  });
  if (starts.length === 0) return null;
  const rest = snippet.slice(Math.min(...starts));
  const end = Math.min(...LOCATION_ENDS.map((mark) => rest.indexOf(mark)).filter((index) => index >= 0), rest.length);
  return rest.slice(0, end).trim().slice(0, LOCATION_MAX) || null;
};

/** The text between the first "(" and the next ")" ("gverdi (Giulia Verdi) · GitHub"). */
const inBrackets = (title: string): string | null => {
  const open = title.indexOf('(');
  const close = open < 0 ? -1 : title.indexOf(')', open + 1);
  return close > open + 1 ? title.slice(open + 1, close).trim() || null : null;
};

function fromLinkedin(result: WebResult, segments: readonly string[]): WebPerson | null {
  if (segments[0] !== 'in' || !segments[1]) return null;
  const handle = decodeURIComponent(segments[1]).toLowerCase();
  const { name, headline } = titleParts(result.title, 'linkedin');
  if (name === '') return null;
  return { source: 'linkedin', ...splitName(name), headline, location: locationIn(result.snippet), profileUrl: `https://www.linkedin.com/in/${handle}/`, handle };
}

function fromGithub(result: WebResult, segments: readonly string[]): WebPerson | null {
  const [login] = segments;
  if (segments.length !== 1 || !login || GITHUB_RESERVED.has(login.toLowerCase())) return null;
  const name = inBrackets(result.title);
  const split = name ? splitName(name) : { firstName: UNNAMED_GITHUB, lastName: null };
  return { source: 'github', ...split, headline: null, location: null, profileUrl: `https://github.com/${login}`, handle: login };
}

/** Two to four words, each capitalised (or a surname particle): a person's name, not a page title. */
const looksLikeName = (name: string): boolean => {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.some((word) => NOT_A_NAME.has(word.toLowerCase()))) return false;
  return words.length >= 2 && words.length <= 4 && words.every((word, index) => /^\p{Lu}[\p{L}'’.-]*$/u.test(word) || (index > 0 && PARTICLES.has(word)));
};

function fromPage(result: WebResult): WebPerson | null {
  const { name, headline } = titleParts(result.title);
  const person = name.split(':')[0]?.trim() ?? '';
  if (!looksLikeName(person)) return null;
  return { source: 'web', ...splitName(person), headline, location: null, profileUrl: result.url, handle: null };
}

/**
 * Who a Google result points to: a LinkedIn profile (name from the title, "Name - Headline | LinkedIn"), a GitHub
 * account ("login (Name) · GitHub"), or another page whose title starts with a person's name. Null for everything else
 * (companies, posts, repositories, articles). Deterministic, no model, never a score.
 */
export function personFromWebResult(result: WebResult): WebPerson | null {
  const url = parse(result.url);
  if (!url) return null;
  if (/(^|\.)linkedin\.com$/.test(url.host)) return fromLinkedin(result, url.segments);
  if (url.host === 'github.com') return fromGithub(result, url.segments);
  return fromPage(result);
}

/** What Google shows about the result: its snippet, as the one fact, with the search as criterion. */
export function webEvidence(query: string, snippet: string): SourcingEvidence[] {
  const text = snippet.trim();
  return text === '' ? [] : [{ criterion: query.trim().slice(0, CRITERION_MAX), text: text.slice(0, SNIPPET_MAX), where: EVIDENCE_WHERE }];
}
