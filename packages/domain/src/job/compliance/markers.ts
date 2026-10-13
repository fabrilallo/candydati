/** Wordings that declare the ad is addressed to everybody (D.Lgs. 198/2006). Matched on folded text. */
const INCLUSIVE_MARKERS: readonly RegExp[] = [
  /(?<![a-z])[mfwd]\s*[/|,.-]\s*[mfwd](?:\s*[/|,.-]\s*[mfwdx])?(?![a-z])/,
  /\buomo\s*[/-]\s*donna\b|\bdonna\s*[/-]\s*uomo\b/,
  /\bambosessi\b/,
  /\bentrambi\s+i\s+sessi\b/,
  /\b(?:sia\s+)?uomini\s+(?:e|o|che)\s+(?:donne|sia\s+donne)\b|\bdonne\s+(?:e|o)\s+uomini\b/,
  /\bl\.?\s*903\s*\/?\s*(?:77|1977)?\b|\bd\.?\s*lgs\.?\s*198\s*\/\s*2006\b/,
  /\b[a-z]{3,}[*@ə]/,
];

/** True when the text carries an inclusive marker: (m/f), M/F/X, uomo/donna, ambosessi, `sviluppator*`, ... */
export const hasInclusiveMarker = (folded: string): boolean => INCLUSIVE_MARKERS.some((pattern) => pattern.test(folded));
