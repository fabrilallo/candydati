/**
 * Lower-cases and strips accents one UTF-16 unit at a time, so the result has the SAME length as the input and an
 * index found in it points at the same place in the original text (used to quote the offending words).
 * Typographic apostrophes and dashes become plain ones; every kind of whitespace becomes a space.
 */
export function fold(text: string): string {
  let out = '';
  for (const unit of text) {
    const [base = ''] = unit.normalize('NFD');
    const lower = base.toLowerCase();
    const single = lower.length === 1 ? lower : unit;
    out += unit.length === 1 ? single : unit;
  }
  return out
    .replace(/[‘’´`]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s/g, ' ');
}

export interface Fragment {
  readonly path: string;
  readonly text: string;
  readonly folded: string;
}

export const fragment = (path: string, text: string): Fragment => ({ path, text, folded: fold(text) });

/** The original text of a match found in the folded text. */
export const quote = (frag: Fragment, index: number, length: number): string => frag.text.slice(index, index + length).trim();
