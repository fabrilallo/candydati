const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[·–—]/g, '-'],
  [/€/g, 'EUR'],
];

/** Text the standard Helvetica font can draw in the WinAnsi encoding: Latin-1, with typographic marks simplified. */
const drawable = (line: string): string =>
  REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line)
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '?')
    .replace(/[\\()]/g, (char) => `\\${char}`);

/**
 * A one-page PDF with one line of text per entry: the demo CVs. Real text (not an image), so the CV reader of the
 * product can extract it and full-text search finds it.
 */
export function textPdf(lines: readonly string[]): Uint8Array<ArrayBuffer> {
  const body = lines.map((line, index) => `BT /F1 11 Tf 64 ${760 - index * 17} Td (${drawable(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  const header = '%PDF-1.4\n';
  const chunks = objects.map((object, index) => `${index + 1} 0 obj\n${object}\nendobj\n`);
  const offsets = chunks.reduce<readonly number[]>(
    (acc, _chunk, index) => [...acc, index === 0 ? Buffer.byteLength(header, 'latin1') : (acc[index - 1] as number) + Buffer.byteLength(chunks[index - 1] as string, 'latin1')],
    [],
  );
  const xrefAt = Buffer.byteLength(header + chunks.join(''), 'latin1');
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(header + chunks.join('') + xref + trailer, 'latin1'));
}
