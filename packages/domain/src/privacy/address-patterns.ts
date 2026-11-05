/**
 * Street addresses of the corpus countries, and the postal code that follows one on the same line. A street needs its
 * type word and a house number; a postal code is only looked for right after an address, so an ordinary number
 * ("a team of 20121 people") stays. Every quantifier is bounded: the text comes from strangers.
 */
const CAP_WORD = String.raw`\p{Lu}[\p{L}'’.-]{0,30}`;
const IT_PARTICLE = 'd[aei]|del|della|dei|degli|delle';

export const STREET_IT = new RegExp(
  String.raw`\b(?:Via|Viale|Piazza|Piazzale|Corso|Largo|Vicolo|Strada|Contrada|Borgo)(?:\s{1,3}(?:${CAP_WORD}|${IT_PARTICLE})){1,5},?\s{1,3}\d{1,3}(?:\s?\/\s?[a-zA-Z]|[a-zA-Z])?(?:[\s,-]{1,5}\d{5}\s{1,3}\p{Lu}[\p{L}']{1,30}(?:\s\p{Lu}[\p{L}']{1,30}){0,2}(?:\s{0,3}\([A-Z]{2}\))?)?(?![\d\p{L}])`,
  'gu',
);

const EN_SUFFIX = String.raw`(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Way|Court|Ct\.?|Place|Pl\.?|Square|Sq\.?|Terrace|Close|Crescent|Highway|Parkway|Row|Gardens|Grove)`;
const EN_POSTAL = String.raw`(?:,\s{0,3}\p{Lu}\p{L}{1,30}(?:\s{1,3}\p{Lu}\p{L}{1,30}){0,2},?\s{1,3}(?:[A-Z]{2}\s{1,3}\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}))?`;
export const STREET_EN = new RegExp(String.raw`(?<!\d)\d{1,5}[A-Z]?\s{1,3}(?:\p{Lu}\p{L}{0,30}\s{1,3}){1,3}${EN_SUFFIX}(?!\p{L})${EN_POSTAL}`, 'gu');
export const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/g;

const FR_TYPE = 'rue|avenue|av\\.|boulevard|bd|place|chemin|allée|impasse|quai';
const FR_WORD = String.raw`(?:[ldLD]['’])?${CAP_WORD}|de|des|du|la|le|les|aux?|[ld]['’]\p{Lu}[\p{L}'’-]{0,30}`;
/** The last word of a street name is a name, not a particle ("2 place du classement" stays). */
const FR_LAST = String.raw`(?:[ldLD]['’])?${CAP_WORD}`;
/** "12 rue des Lilas", "45 bis avenue Jean Jaurès": number first, as in France. */
export const STREET_FR = new RegExp(
  String.raw`(?<![\p{L}\p{N}])\d{1,4}(?:\s?(?:bis|ter|[A-D]))?,?\s{1,3}(?:${FR_TYPE})(?:\s{1,3}(?:${FR_WORD})){0,5}\s{1,3}${FR_LAST}(?![\p{L}\p{N}])`,
  'gu',
);
/** "Rue de la Loi 160", "Chemin des Vignes 8": street first, as in Belgium and Switzerland. */
export const STREET_FR_FIRST = new RegExp(
  String.raw`(?<!\p{L})(?:Rue|Avenue|Boulevard|Chemin|Place|Route|Allée|Quai|Impasse)(?:\s{1,3}(?:${FR_WORD})){0,5}\s{1,3}${FR_LAST},?\s{1,3}\d{1,4}[a-z]?(?![\p{L}\p{N}])`,
  'gu',
);

const DE_SUFFIX = 'straße|strasse|str\\.|weg|allee|platz|gasse|damm|ufer|chaussee';
const DE_TYPE = 'Straße|Strasse|Str\\.|Weg|Allee|Platz|Gasse|Ring|Damm|Ufer|Chaussee';
const DE_NUMBER = String.raw`\s{1,3}\d{1,3}\s?[a-z]?(?:\s?\/\s?\d{1,3})?(?![\p{L}\p{N}])`;
/** "Hauptstraße 12", "Leopoldstr. 45a", "Mariahilfer Straße 88/5". */
export const STREET_DE = new RegExp(String.raw`(?<!\p{L})(?:\p{Lu}\p{L}{1,40}(?:${DE_SUFFIX})|\p{Lu}\p{L}{1,40}\s(?:${DE_TYPE}))${DE_NUMBER}`, 'gu');

const ES_TYPE = String.raw`Calle|C\/|Avenida|Avda\.|Av\.|Paseo|Plaza|Pza\.|Camino|Carrera|Ronda|Travesía|Rambla|Carretera`;
const ES_WORD = `${CAP_WORD}|de|del|la|las|los|el|y`;
/** "Calle de Alcalá 123", "C/ Mayor, 12", "Av. Insurgentes Sur 1602". */
export const STREET_ES = new RegExp(
  String.raw`(?<!\p{L})(?:${ES_TYPE})(?:\s{1,3}(?:${ES_WORD})){0,5}\s{1,3}${CAP_WORD},?\s{1,3}\d{1,5}(?![\p{L}\p{N}])`,
  'gu',
);

const POSTAL = String.raw`(?:[A-Z]\d{4}[A-Z]{0,3}|\d{4,5}|[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ \t]?\d[ABCEGHJ-NPRSTV-Z]\d)`;
const CITY = String.raw`(?:[ \t]{1,3}\p{Lu}[\p{L}'’-]{1,30}(?:[ \t]{1,3}(?:de[ \t]{1,3})?\p{Lu}[\p{L}'’-]{1,30}){0,2})?`;
/** A postal code (and its city) at most 40 characters after an address on the same line. */
const AFTER_ADDRESS = new RegExp(String.raw`(\[address\][^\n]{0,40}?)(?<![\p{L}\p{N}])(${POSTAL})(${CITY})(?![\p{L}\p{N}])`, 'gu');
const YEAR = /^(?:19|20)\d{2}$/;
/** Only separators between the street and the postal code: one address, one marker. */
const JOINED = /^\[address\][\s,–-]{0,5}$/;

/** The postal code after an address: "[address], 4º B, 28009 Madrid" -> "[address], 4º B, [address]". */
export const replacePostalAfterAddress =
  (marker: string) =>
  (text: string): string =>
    text.replace(AFTER_ADDRESS, (match: string, before: string, code: string, city: string) =>
      YEAR.test(code) && city === '' ? match : JOINED.test(before) ? marker : `${before}${marker}`,
    );
