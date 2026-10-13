import { describe, expect, it } from 'vitest';
import { contentDisposition, wantsInline } from './content-disposition.js';

describe('contentDisposition', () => {
  it('quotes an ASCII name and repeats the exact name percent-encoded', () => {
    expect(contentDisposition('attachment', 'Giulia Bianchi.pdf')).toBe(
      `attachment; filename="Giulia Bianchi.pdf"; filename*=UTF-8''Giulia%20Bianchi.pdf`,
    );
  });

  it('keeps accents in filename* and replaces them in the fallback', () => {
    const header = contentDisposition('inline', 'Niccolò Sàbato.pdf');
    expect(header).toContain('filename="Niccol_ S_bato.pdf"');
    expect(header).toContain("filename*=UTF-8''Niccol%C3%B2%20S%C3%A0bato.pdf");
  });

  it('cannot be broken out of by quotes, backslashes or header separators', () => {
    const header = contentDisposition('attachment', 'a"; x=1\\ \'(*).pdf');
    expect(header).not.toMatch(/filename="[^"]*"[^;]/);
    expect(header.match(/"/g)).toHaveLength(2);
    expect(header).toContain("%27%28%2A%29");
  });
});

describe('wantsInline', () => {
  it('is true only for a PDF asked inline', () => {
    expect(wantsInline('inline', 'application/pdf')).toBe(true);
    expect(wantsInline('inline', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    expect(wantsInline('attachment', 'application/pdf')).toBe(false);
    expect(wantsInline(undefined, 'application/pdf')).toBe(false);
  });
});
