import { describe, expect, it } from 'vitest';
import { markdownCell } from './report.js';

describe('markdownCell', () => {
  it('flattens whitespace and escapes pipes so a cell stays one cell', () => {
    expect(markdownCell('a\n  b | c')).toBe('a b \\| c');
  });

  it('escapes backslashes first, so an answer ending in \\ cannot escape the next pipe', () => {
    expect(markdownCell('C:\\path\\')).toBe('C:\\\\path\\\\');
    expect(markdownCell('a \\| b')).toBe('a \\\\\\| b');
  });

  it('cuts long text before escaping, so no escape is split in half', () => {
    expect(markdownCell(`${'x'.repeat(159)}\\|`)).toBe(`${'x'.repeat(159)}\\\\…`);
    expect(markdownCell('short', 3)).toBe('sho…');
  });
});
