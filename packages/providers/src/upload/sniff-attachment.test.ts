import { describe, expect, it } from 'vitest';
import { makeDocx, makePdf, makeZip } from '../testing/fixtures.js';
import { sniffAttachment } from './sniff-attachment.js';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const utf16 = (value: string): number[] => [...value].flatMap((char) => [char.charCodeAt(0), 0]);
const odt = (mimetype = 'application/vnd.oasis.opendocument.text') => makeZip([{ name: 'mimetype', content: mimetype }, { name: 'content.xml', content: '<office:document-content/>' }]);

describe('sniffAttachment', () => {
  it('recognises every allowed type from the content and renames the file to match', () => {
    const cases: readonly [Uint8Array, string, string][] = [
      [makePdf(['x']), 'letter.exe', 'application/pdf'],
      [makeDocx(['x']), 'letter.pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      [bytes(...CFB, 0, 0, ...utf16('WordDocument'), 0, 0), 'old.doc', 'application/msword'],
      [odt(), 'letter.odt', 'application/vnd.oasis.opendocument.text'],
      [text('{\\rtf1\\ansi hello}'), 'letter.rtf', 'application/rtf'],
      [text('﻿Dear team,\r\n\tI am writing…'), 'letter.txt', 'text/plain'],
      [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'scan.png', 'image/png'],
      [bytes(0xff, 0xd8, 0xff, 0xe0, 0), 'photo.jpeg', 'image/jpeg'],
    ];
    for (const [content, name, mediaType] of cases) expect(sniffAttachment(content, name)?.mediaType).toBe(mediaType);
    expect(sniffAttachment(makePdf(['x']), '../../etc/Lettera di presentazione.exe')).toEqual({ mediaType: 'application/pdf', fileName: 'Lettera di presentazione.pdf' });
    expect(sniffAttachment(bytes(0xff, 0xd8, 0xff, 0xe0), '')?.fileName).toBe('attachment.jpg');
  });

  it('refuses executables, archives, other OLE files, markup, scripts and binary data', () => {
    const cases: Uint8Array[] = [
      new Uint8Array(),
      bytes(0x4d, 0x5a, 0x90, 0x00), // Windows executable
      bytes(0x7f, 0x45, 0x4c, 0x46, 0x02), // ELF
      bytes(0xcf, 0xfa, 0xed, 0xfe, 0x07), // Mach-O
      bytes(0x1f, 0x8b, 0x08, 0x00), // gzip
      bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c), // 7z
      bytes(...CFB, 0, 0, ...utf16('Workbook')), // Excel or an installer
      makeZip([{ name: 'notes.txt', content: 'hello' }]),
      makeZip([{ name: 'xl/workbook.xml', content: '<x/>' }]),
      odt('application/vnd.oasis.opendocument.spreadsheet'),
      makeZip([{ name: 'mimetype', content: 'application/vnd.oasis.opendocument.text' }]),
      text('<html><body>hi</body></html>'),
      text('  <svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      text('Hello <script>alert(1)</script>'),
      text('<?xml version="1.0"?><svg/>'),
      text('#!/bin/sh\nrm -rf /'),
      text('binary\u0000data'),
      bytes(0xc3, 0x28), // invalid UTF-8
    ];
    for (const content of cases) expect(sniffAttachment(content, 'x.pdf')).toBeNull();
  });

  it('refuses an ODT whose mimetype entry is compressed or truncated', () => {
    const compressed = Uint8Array.from(odt());
    compressed[8] = 8; // method: deflate
    expect(sniffAttachment(compressed, 'x.odt')).toBeNull();
    const truncated = Uint8Array.from(odt());
    truncated[18] = 0xff; // compressed size past the end of the file
    truncated[19] = 0xff;
    expect(sniffAttachment(truncated.subarray(0, 60), 'x.odt')).toBeNull();
    expect(sniffAttachment(bytes(0x50, 0x4b, 0x03, 0x04, 0), 'x.odt')).toBeNull();
  });
});
