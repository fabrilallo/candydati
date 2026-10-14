import { describe, expect, it } from 'vitest';
import { makeDocx, makeLyingBomb, makePdf, makeZip } from '../testing/fixtures.js';
import { safeFileName } from './file-name.js';
import { sniffCv } from './sniff.js';
import { ZIP_MAX_ENTRIES, ZIP_MAX_ENTRY_BYTES, zipHasEntry } from './zip.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('sniffCv', () => {
  it('accepts a PDF by magic bytes and ignores the declared extension', () => {
    expect(sniffCv(makePdf(['x']), 'resume.exe')).toEqual({ mediaType: 'application/pdf', fileName: 'resume.pdf' });
  });

  it('accepts a DOCX by its structure', () => {
    expect(sniffCv(makeDocx(['x']), 'My CV.pdf')).toEqual({ mediaType: DOCX, fileName: 'My CV.docx' });
  });

  it('rejects everything else', () => {
    const cases: Uint8Array[] = [
      new Uint8Array(),
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0]), // legacy .doc
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // png
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), // jpeg
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), // exe
      new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), // elf
      new TextEncoder().encode('%PD'),
      new TextEncoder().encode('<html>%PDF-</html>'),
      makeZip([{ name: 'notes.txt', content: 'hello' }]),
      makeZip([{ name: 'xl/workbook.xml', content: '<x/>' }]),
    ];
    for (const bytes of cases) expect(sniffCv(bytes, 'x.pdf')).toBeNull();
  });
});

describe('zipHasEntry limits', () => {
  it('rejects an entry declaring a huge size', () => {
    const bomb = makeZip([{ name: 'word/document.xml', content: '<x/>', declaredSize: ZIP_MAX_ENTRY_BYTES + 1 }]);
    expect(zipHasEntry(bomb, 'word/document.xml')).toBe(false);
    expect(sniffCv(bomb, 'a.docx')).toBeNull();
  });

  it('rejects too many entries', () => {
    const many = makeZip(Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}`, content: '' })));
    expect(zipHasEntry(many, 'f0')).toBe(false);
  });

  it('rejects truncated and corrupted archives', () => {
    const docx = makeDocx(['x']);
    expect(zipHasEntry(docx.subarray(0, docx.length - 10), 'word/document.xml')).toBe(false);
    const corrupted = Uint8Array.from(docx);
    const eocd = corrupted.length - 22;
    corrupted[eocd + 16] = 0; // central directory offset 0: not a central header
    corrupted[eocd + 17] = 0;
    expect(zipHasEntry(corrupted, 'word/document.xml')).toBe(false);
    expect(zipHasEntry(new Uint8Array(5), 'x')).toBe(false);
  });

  it('rejects a central directory running past the end', () => {
    const docx = Uint8Array.from(makeDocx(['x']));
    const eocd = docx.length - 22;
    docx[eocd + 12] = 0xff; // size too large
    expect(zipHasEntry(docx, 'word/document.xml')).toBe(false);
  });

  it('rejects a name running past the end of the buffer', () => {
    const docx = Uint8Array.from(makeDocx(['x']));
    const view = new DataView(docx.buffer);
    const offset = view.getUint32(docx.length - 22 + 16, true);
    view.setUint16(offset + 28, 0xffff, true);
    expect(zipHasEntry(docx, 'word/document.xml')).toBe(false);
  });
});

describe('safeFileName', () => {
  const pdf = 'application/pdf';
  it.each([
    ['../../etc/passwd', 'passwd.pdf'],
    ['C:\\Users\\me\\CV Mario Rossi.docx', 'CV Mario Rossi.pdf'],
    ['a"b\'c`d.pdf', 'abcd.pdf'],
    ['line\nbreak\u0000.pdf', 'linebreak.pdf'],
    ['evil\u202egpj.exe', 'evilgpj.pdf'],
    ['', 'cv.pdf'],
    ['...', 'cv.pdf'],
    ['.pdf', 'cv.pdf'],
    ['Curriculum Vitæ.final.pdf', 'Curriculum Vitæ.final.pdf'],
  ])('%j -> %s', (input, expected) => {
    expect(safeFileName(input, pdf)).toBe(expected);
  });

  it('caps the length at 120 characters including the extension', () => {
    const name = safeFileName(`${'a'.repeat(300)}.pdf`, pdf);
    expect(name.length).toBe(120);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(safeFileName(`${'à'.repeat(300)}.docx`, DOCX).length).toBeLessThanOrEqual(120);
  });
});

describe('sniffCv zip bombs', () => {
  it('refuses a DOCX that inflates far beyond what it declares', () => {
    const bomb = makeLyingBomb('word/document.xml', 64 * 1024 * 1024, 100);
    expect(zipHasEntry(bomb, 'word/document.xml')).toBe(true); // the headers look fine
    expect(sniffCv(bomb, 'cv.docx')).toBeNull();
  });
});
