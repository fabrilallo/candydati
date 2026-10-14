export interface ByteRange {
  readonly start: number;
  /** Inclusive; null: to the end of the file. */
  readonly end: number | null;
}

/**
 * A single `bytes=a-b` or `bytes=a-` range. Suffix ranges (`bytes=-n`), several ranges, other units and anything malformed
 * are ignored (null): the whole file is served, which RFC 9110 allows for any Range a server does not understand.
 */
export function parseByteRange(header: string | undefined): ByteRange | null {
  const match = /^bytes=(\d{1,15})-(\d{0,15})$/.exec(header?.trim() ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === '' ? null : Number(match[2]);
  return end !== null && end < start ? null : { start, end };
}
