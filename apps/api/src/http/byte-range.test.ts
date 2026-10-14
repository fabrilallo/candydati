import { describe, expect, it } from 'vitest';
import { parseByteRange } from './byte-range.js';

describe('parseByteRange', () => {
  it('reads a closed and an open range', () => {
    expect(parseByteRange('bytes=0-99')).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=500-')).toEqual({ start: 500, end: null });
    expect(parseByteRange(' bytes=5-5 ')).toEqual({ start: 5, end: 5 });
  });

  it.each([undefined, '', 'bytes=-500', 'bytes=0-1,5-9', 'items=0-1', 'bytes=9-3', 'bytes=a-b', 'bytes=0-1-2', 'bytes=-', `bytes=${'9'.repeat(30)}-`])(
    'ignores %s',
    (header) => expect(parseByteRange(header)).toBeNull(),
  );
});
