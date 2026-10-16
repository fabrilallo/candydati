import type { CvMediaType } from '@candydati/domain';
import type { AttachmentSniffer, CvModelExtractor, CvSniffer, CvTextExtractor, FileStorage, QueuedTask, TaskQueue } from '../intake-ports.js';

export interface InMemoryFileStorage extends FileStorage {
  keys(): readonly string[];
}

export function createInMemoryFileStorage(initial: Readonly<Record<string, Uint8Array>> = {}): InMemoryFileStorage {
  let files: Readonly<Record<string, Uint8Array>> = { ...initial };
  return {
    async put(key, bytes) {
      files = { ...files, [key]: bytes };
    },
    async putStream(key, source) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of source) chunks.push(chunk);
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      files = { ...files, [key]: bytes };
      return bytes.byteLength;
    },
    async getStream(key) {
      const bytes = files[key];
      if (!bytes) throw Object.assign(new Error(`No such file: ${key}`), { name: 'FileNotFoundError' });
      return {
        stream: (async function* () {
          yield bytes;
        })(),
        sizeBytes: bytes.byteLength,
      };
    },
    async getRange(key, start, end) {
      const bytes = files[key];
      if (!bytes) throw Object.assign(new Error(`No such file: ${key}`), { name: 'FileNotFoundError' });
      const part = bytes.subarray(start, end + 1);
      return {
        stream: (async function* () {
          yield part;
        })(),
        sizeBytes: part.byteLength,
      };
    },
    async get(key) {
      const bytes = files[key];
      if (!bytes) throw Object.assign(new Error(`No such file: ${key}`), { name: 'FileNotFoundError' });
      return bytes;
    },
    async delete(key) {
      files = Object.fromEntries(Object.entries(files).filter(([k]) => k !== key));
    },
    keys: () => Object.keys(files),
  };
}

export interface InMemoryTaskQueue extends TaskQueue {
  jobs(): readonly QueuedTask[];
}

export function createInMemoryTaskQueue(failWith?: Error): InMemoryTaskQueue {
  let queued: ReturnType<InMemoryTaskQueue['jobs']> = [];
  return {
    async enqueue(name, payload) {
      if (failWith) throw failWith;
      queued = [...queued, { name, payload } as QueuedTask];
    },
    jobs: () => queued,
  };
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]) => signature.every((b, i) => bytes[i] === b);

/** Fake of the real sniffer: `%PDF-` is a PDF, `PK\x03\x04` is a DOCX. The name is reduced to its last segment. */
export const fakeCvSniffer: CvSniffer = (bytes, declaredName) => {
  const base = declaredName.split(/[\\/]/).pop()?.trim() || 'cv';
  const stem = base.replace(/\.[^.]*$/, '') || 'cv';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mediaType: 'application/pdf', fileName: `${stem}.pdf` };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return { mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileName: `${stem}.docx` };
  }
  return null;
};

const PNG = [0x89, 0x50, 0x4e, 0x47];

/**
 * Fake of the real attachment sniffer: what `fakeCvSniffer` accepts, `\x89PNG` is a PNG, printable text with no `<` is
 * plain text; anything else (an `MZ` executable, markup, binary bytes) is refused.
 */
export const fakeAttachmentSniffer: AttachmentSniffer = (bytes, declaredName) => {
  const cv = fakeCvSniffer(bytes, declaredName);
  if (cv) return cv;
  const stem = (declaredName.split(/[\\/]/).pop()?.trim() || 'attachment').replace(/\.[^.]*$/, '') || 'attachment';
  if (startsWith(bytes, PNG)) return { mediaType: 'image/png', fileName: `${stem}.png` };
  const text = new TextDecoder().decode(bytes);
  if (bytes.length > 0 && !startsWith(bytes, [0x4d, 0x5a]) && /^[\t\n\r\x20-\x7e]*$/.test(text) && !text.includes('<')) return { mediaType: 'text/plain', fileName: `${stem}.txt` };
  return null;
};

/** Returns `text` whatever the document, or throws when `text` is an Error. */
export const fakeTextExtractor = (text: string | Error): CvTextExtractor => ({
  async extractText(_bytes: Uint8Array, _mediaType: CvMediaType) {
    if (text instanceof Error) throw text;
    return text;
  },
});

/** Returns `result` as is (the use case validates it), or throws when it is an Error. */
export const fakeModelExtractor = (result: unknown | Error): CvModelExtractor => ({
  async extract() {
    if (result instanceof Error) throw result;
    return result;
  },
});
