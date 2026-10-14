import { describe, expect, it } from 'vitest';
import { makeDocx, makeLyingBomb, makePdf } from '../testing/fixtures.js';
import { CV_TEXT_MAX_CHARS, extractCvText, normalizeCvText } from './extract-text.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('extractCvText zip bombs', () => {
  it('refuses a DOCX that lies about its size before the reader inflates it', async () => {
    const bomb = makeLyingBomb('word/document.xml', 64 * 1024 * 1024, 100);
    await expect(extractCvText(bomb, DOCX)).rejects.toThrow(/inflates/);
  });
});

describe('extractCvText', () => {
  it('reads a PDF', async () => {
    const text = await extractCvText(makePdf(['Mario Rossi', 'Sviluppatore backend (Node)']), 'application/pdf');
    expect(text).toContain('Mario Rossi');
    expect(text).toContain('Sviluppatore backend (Node)');
  });

  it('reads a DOCX', async () => {
    const text = await extractCvText(makeDocx(['Giulia Bianchi', 'Data engineer & analyst']), DOCX);
    expect(text).toBe('Giulia Bianchi\n\nData engineer & analyst');
  });

  it('does not mutate the input bytes', async () => {
    const bytes = makePdf(['x']);
    const copy = Uint8Array.from(bytes);
    await extractCvText(bytes, 'application/pdf');
    expect(bytes).toEqual(copy);
  });

  it('throws on a corrupted document', async () => {
    await expect(extractCvText(new TextEncoder().encode('%PDF-1.4 garbage'), 'application/pdf')).rejects.toThrow();
    await expect(extractCvText(new TextEncoder().encode('PK\x03\x04 garbage'), DOCX)).rejects.toThrow();
  });
});

describe('normalizeCvText', () => {
  it('collapses whitespace and control characters', () => {
    expect(normalizeCvText('  a \t b\r\n\r\n\r\n\r\n c \u0000 d  ')).toBe('a b\n\nc d');
  });

  it('caps the length', () => {
    expect(normalizeCvText('a'.repeat(CV_TEXT_MAX_CHARS + 500))).toHaveLength(CV_TEXT_MAX_CHARS);
  });
});
