/**
 * National identity and tax numbers other than the Italian codice fiscale: the Spanish DNI and NIE when their check
 * letter is right (so an order number stays), and any id written after its label (DNI, RFC, CURP, ...).
 */
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const NIE_PREFIX = { X: '0', Y: '1', Z: '2' } as const;

/** Eight digits and a letter (DNI), or X/Y/Z, seven digits and a letter (NIE). */
export const SPANISH_ID = /(?<![\p{L}\p{N}])(?:\d{8}|[XYZ]\d{7})[A-Z](?![\p{L}\p{N}])/gu;

/** True when the check letter is the one the number gives: a real DNI/NIE shape, not a code that looks like one. */
export function isSpanishId(candidate: string): boolean {
  const prefix = candidate[0] as keyof typeof NIE_PREFIX;
  const digits = prefix in NIE_PREFIX ? `${NIE_PREFIX[prefix]}${candidate.slice(1, -1)}` : candidate.slice(0, -1);
  return DNI_LETTERS[Number(digits) % DNI_LETTERS.length] === candidate.slice(-1);
}

const ID_LABELS = 'DNI|NIE|NIF|CUIL|CUIT|RFC|CURP|RUT|AHV|SSN|NINO|Steuer-?ID|Steuernummer|Personalausweis(?:nummer)?';

/** "DNI 30.123.456", "RFC: HEOA920315AB1": the id after its label, when it carries at least one digit. */
export const LABELLED_ID = new RegExp(
  String.raw`(?<!\p{L})((?:${ID_LABELS})(?:[ \t]{0,3}(?:n[º°o]\.?|nr\.?))?[ \t]{0,3}:?[ \t]{0,3})(?=[A-Z0-9.\- ]{0,24}\d)([A-Z0-9](?:[A-Z0-9.\-]|[ \t](?=\d)){4,22}[A-Z0-9])(?![\p{L}\p{N}])`,
  'gu',
);
