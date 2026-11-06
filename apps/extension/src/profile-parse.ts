import type { LinkedinProfile } from '@candydati/domain';

/** What the page script collects on a profile: raw text only, never a photo or a hidden field. */
export interface RawProfilePage {
  readonly url: string;
  readonly title: string;
  /** The first heading of the main section: the person's name on a profile. */
  readonly heading: string | null;
  /** The visible text of the main section. */
  readonly main: string;
}

const TEXT_MAX = 20_000;
/** Lines LinkedIn puts between the name and the rest that are not a headline. */
const NOISE = /^(·|he\/him|she\/her|they\/them|.*\b(connections?|followers?|contact info|informazioni di contatto|collegamenti|follower)\b.*|· ?\d+(st|nd|rd|th|°)?|\d+(st|nd|rd|th|°))$/i;
/** The first section of the profile: the header (name, headline, location) ends here. */
const SECTION = /^(about|activity|experience|education|skills|informazioni|attività|esperienza|formazione|competenze|highlights|in evidenza)$/i;
/** A place reads like "City, Region, Country": commas, no sentence punctuation or headline separators, short. */
const looksLikePlace = (line: string): boolean => line.includes(',') && line.length <= 120 && !/[.!?@|•]|\bat\b|\bpresso\b/i.test(line);

const nameFromTitle = (title: string): string | null => {
  const name = title.replace(/^\(\d+\)\s*/, '').split('|')[0]?.trim() ?? '';
  return name === '' || /^linkedin$/i.test(name) ? null : name;
};

/**
 * A profile from the text the page shows: the name (heading, else the page title), the headline (the first meaningful
 * line under the name), the location (the first line under it that reads like a place) and the capped visible text.
 * Null when the page carries no name: not a profile.
 */
export function parseProfile(page: RawProfilePage): LinkedinProfile | null {
  const fullName = page.heading?.trim() || nameFromTitle(page.title);
  if (!fullName) return null;
  const lines = page.main.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const start = lines.indexOf(fullName);
  const header = start < 0 ? [] : lines.slice(start + 1, start + 8);
  const end = header.findIndex((line) => SECTION.test(line));
  const afterName = (end < 0 ? header : header.slice(0, end)).filter((line) => !NOISE.test(line) && line !== fullName);
  const headline = afterName.find((line) => !looksLikePlace(line) && line.length > 3) ?? null;
  const location = afterName.find((line) => line !== headline && looksLikePlace(line)) ?? null;
  return { profileUrl: page.url, fullName, headline, location, text: page.main.slice(0, TEXT_MAX) };
}
