/** Why a known gap cannot be closed with a deterministic pattern without masking ordinary words. */

/** A third party named in free prose, with no title, no relation phrase, no references section and no contact. */
export const plainProse = (sentence: string): string =>
  `third-party name in plain prose ("${sentence}"): only a named-entity recognizer tells it from a company or a product; ` +
  '"with/con/avec/mit + two capitalized words" also matches "with Google Cloud"';

/** "Am Sandtorkai 5": a German street with no type word (Straße, Weg, ...). */
export const STREET_WITHOUT_TYPE =
  'street with no type word ("Am Sandtorkai 5"): "Am/Im/An der + word + number" also matches "Im Team 5" or "Am Standort 3"';

/** The postal code of an address the patterns do not find: only codes right after a found address are removed. */
export const POSTAL_WITHOUT_STREET =
  'postal code after an unrecognized street: a bare 5-digit number before a capitalized word is also "50000 Euro" or "20121 Mitarbeiter"';

/** The second surname of a Spanish-speaking candidate when the stored last name holds only the first one. */
export const SECOND_SURNAME =
  'second surname not in the stored last name ("Hernández Ortega", lastName "Hernández"): the word after the surname is just as often a company or a city';
