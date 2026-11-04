import { describe, expect, it } from 'vitest';
import { textPdf } from './pdf.js';

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

describe('textPdf', () => {
  it('is a PDF (magic bytes the upload checks) with one text line per entry', () => {
    const pdf = latin1(textPdf(['Francesca Marino', 'Backend Developer']));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Francesca Marino) Tj');
    expect(pdf).toContain('(Backend Developer) Tj');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('keeps accented letters in the WinAnsi encoding and replaces what the font cannot draw', () => {
    const pdf = latin1(textPdf(['Città: Forlì · 8 €, l’anno (part-time)']));
    expect(pdf).toContain('/Encoding /WinAnsiEncoding');
    expect(pdf).toContain('(Città: Forlì - 8 EUR, l\'anno \\(part-time\\)) Tj');
  });

  it('points the cross-reference table at the real object offsets', () => {
    const pdf = latin1(textPdf(['Riga']));
    const start = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(start).startsWith('xref')).toBe(true);
    const firstOffset = Number(/0000000000 65535 f \n(\d{10})/.exec(pdf)?.[1]);
    expect(pdf.slice(firstOffset).startsWith('1 0 obj')).toBe(true);
  });
});
