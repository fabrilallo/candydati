import { inflateRawSync } from 'node:zlib';

/** A minimal ZIP reader (central directory, stored and deflate entries): enough to check a package, no dependencies. */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Lists the entries of a ZIP buffer: `{ name, size, method, offset, symlink, compressedSize }`. */
export function listZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65_535); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-archive record)');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) throw new Error('corrupt ZIP central directory');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const unixMode = buffer.readUInt32LE(offset + 38) >>> 16;
    entries.push({
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      offset: buffer.readUInt32LE(offset + 42),
      name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
      symlink: (unixMode & 0o170000) === 0o120000,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Reads one entry's content. */
export function readZipEntry(buffer, entry) {
  const at = entry.offset;
  if (buffer.readUInt32LE(at) !== LOCAL) throw new Error(`corrupt ZIP entry ${entry.name}`);
  const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
  const raw = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRawSync(raw, { maxOutputLength: entry.size + 1 });
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}
