const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN = 22;
const EOCD_SEARCH = EOCD_MIN + 0xffff;
const CENTRAL_FIXED = 46;

/** Hard limits so a hostile archive cannot make us walk or inflate unbounded data. */
export const ZIP_MAX_ENTRIES = 2000;
export const ZIP_MAX_ENTRY_BYTES = 30 * 1024 * 1024;

/**
 * Looks for `entryName` in the central directory of a ZIP without decompressing anything.
 * Returns false for malformed archives, too many entries, or an entry declaring a size above the cap.
 */
export function zipHasEntry(bytes: Uint8Array, entryName: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return false;
  const total = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  if (total > ZIP_MAX_ENTRIES || offset + size > eocd) return false;
  const target = new TextEncoder().encode(entryName);
  let cursor = offset;
  for (let index = 0; index < total; index += 1) {
    if (cursor + CENTRAL_FIXED > view.byteLength || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) return false;
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameEnd = cursor + CENTRAL_FIXED + nameLength;
    if (nameEnd > view.byteLength) return false;
    if (sameBytes(bytes.subarray(cursor + CENTRAL_FIXED, nameEnd), target)) {
      return view.getUint32(cursor + 24, true) <= ZIP_MAX_ENTRY_BYTES;
    }
    cursor = nameEnd + extraLength + commentLength;
  }
  return false;
}

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - EOCD_SEARCH);
  for (let position = view.byteLength - EOCD_MIN; position >= lowest; position -= 1) {
    if (view.getUint32(position, true) === EOCD_SIGNATURE) return position;
  }
  return -1;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
