import ExcelJS from 'exceljs';
import { strToU8, zipSync, type Zippable } from 'fflate';

export const utf8 = (text: string): Uint8Array => strToU8(text);

/** Minimal PDF-looking bytes: the sniffer only reads the magic. */
export const pdfBytes = (label = 'cv'): Uint8Array => strToU8(`%PDF-1.4\n${label}\n%%EOF`);

export function docxBytes(): Uint8Array {
  return zipSync({ 'word/document.xml': strToU8('<w:document/>'), '[Content_Types].xml': strToU8('<Types/>') });
}

export function zipOf(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  return zipSync(files as Zippable);
}

export function symlinkZip(): Uint8Array {
  return zipSync({ 'link.pdf': [strToU8('/etc/passwd'), { os: 3, attrs: 0o120777 << 16 }] } as Zippable);
}

/** windows-1252 encoding of a string whose characters are all in Latin-1. */
export const latin1 = (text: string): Uint8Array => Uint8Array.from([...text].map((char) => char.charCodeAt(0)));

export async function xlsxBytes(build: (workbook: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
