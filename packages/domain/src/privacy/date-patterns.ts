/**
 * Full dates (a birth date) in Italian, English, French, German and Spanish. A month with a year only ("03/2019",
 * "mars 2019") is a period of work and stays. Every quantifier is bounded: the text comes from strangers.
 */
export const NUMERIC_DATE = /(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}(?!\d)/g;

/** ISO dates ("1992-07-14"), not ranges of years ("2018-2021"). */
export const ISO_DATE = /(?<![\d-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d-])/g;

/** Month prefixes: it, en, fr ("avr", "jui", "aoû", "déc", "fév"), de ("mär", "mrz", "okt", "dez", "jän"), es ("ene", "abr"). */
const MONTHS = 'gen|feb|fév|fev|mar|mär|mrz|apr|avr|abr|mag|mai|may|giu|jun|jui|lug|jul|ago|aug|aoû|aou|set|sep|ott|oct|okt|nov|dic|dec|déc|dez|jan|jän|ene';

/** "4 avril 1992", "7. Juli 1988", "1er janvier 1990", "3rd March 1990", "15 de marzo de 1992", "1st of May 1990". */
export const WORDED_DATE = new RegExp(
  String.raw`(?<![\p{L}\d])\d{1,2}(?:\.|st|nd|rd|th|er|º)?\s{1,3}(?:(?:de|of)\s{1,3})?(?:${MONTHS})\p{L}{0,8}\.?\s{1,3}(?:de\s{1,3})?(?:19|20)\d{2}(?!\d)`,
  'giu',
);

const EN_MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';

/** "March 4, 1991", "Sept. 12th 1990": English month first, then the day and the year. */
export const MONTH_FIRST_DATE = new RegExp(String.raw`(?<!\p{L})(?:${EN_MONTHS})\.?\s{1,3}\d{1,2}(?:st|nd|rd|th)?,?\s{1,3}(?:19|20)\d{2}(?!\d)`, 'gu');
