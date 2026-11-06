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
const SEPARATOR = /\s+[-–—|·]\s+/;
const LOCATION = /(?:Location|Località|Posizione|Ubicazione)\s*:\s*([^·|\n]+?)\s*(?:[·|\n]|$)/i;

const parse = (value: string): { readonly host: string; readonly segments: readonly string[] } | null => {
  if (!httpUrlSchema.safeParse(value).success) return null;
  const url = new URL(value);
  return { host: url.hostname.toLowerCase().replace(/^www\./, ''), segments: url.pathname.split('/').filter(Boolean) };
};

const splitName = (name: string): { firstName: string; lastName: string | null } => {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') || null };
};

/** "Giulia Verdi - Backend Engineer - Acme | LinkedIn": the name (credentials after a comma left out) and the rest. */
const titleParts = (title: string, suffix: RegExp | null = null): { name: string; headline: string | null } => {
  const [name = '', ...rest] = (suffix ? title.replace(suffix, '') : title).trim().split(SEPARATOR);
  return { name: name.split(',')[0]?.trim() ?? '', headline: rest.join(' - ').trim() || null };
};

const locationIn = (snippet: string): string | null => LOCATION.exec(snippet)?.[1]?.trim().slice(0, LOCATION_MAX) || null;

function fromLinkedin(result: WebResult, segments: readonly string[]): WebPerson | null {
  if (segments[0] !== 'in' || !segments[1]) return null;
  const handle = decodeURIComponent(segments[1]).toLowerCase();
  const { name, headline } = titleParts(result.title, /\s*[-–—|]\s*LinkedIn\s*$/i);
  if (name === '') return null;
  return { source: 'linkedin', ...splitName(name), headline, location: locationIn(result.snippet), profileUrl: `https://www.linkedin.com/in/${handle}/`, handle };
}

function fromGithub(result: WebResult, segments: readonly string[]): WebPerson | null {
  const [login] = segments;
  if (segments.length !== 1 || !login || GITHUB_RESERVED.has(login.toLowerCase())) return null;
  const name = /\(([^)]+)\)/.exec(result.title)?.[1]?.trim();
  const split = name ? splitName(name) : { firstName: UNNAMED_GITHUB, lastName: null };
  return { source: 'github', ...split, headline: null, location: null, profileUrl: `https://github.com/${login}`, handle: login };
}

/** Two to four words, each capitalised (or a surname particle): a person's name, not a page title. */
const looksLikeName = (name: string): boolean => {
  const words = name.split(/\s+/).filter(Boolean);
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
