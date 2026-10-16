import { describe, expect, it, vi } from 'vitest';
import type { JsonReader } from '../../http/index.js';
import { downloadSourceFile } from './file-download.js';

const fakeReader = () => {
  const raw = {
    download: vi.fn(async () => ({ bytes: 1, mediaType: null })),
    downloadPublicFile: vi.fn(async () => ({ bytes: 2, mediaType: null })),
  };
  return { reader: raw as unknown as JsonReader, raw };
};
const store = async () => 0;
const auth = { headers: { authorization: 'Bearer secret' } };

describe('downloadSourceFile', () => {
  it('sends the credentials only to the API origin, through the allowlisted download', async () => {
    const { reader, raw } = fakeReader();
    expect(await downloadSourceFile(reader, 'https://api.vendor.example/v1/files/1?x=1', store, 'https://api.vendor.example/v1', auth)).toEqual({ bytes: 1, mediaType: null });
    expect(raw.download).toHaveBeenCalledWith('https://api.vendor.example/v1/files/1?x=1', store, auth);
    expect(raw.downloadPublicFile).not.toHaveBeenCalled();
  });

  it('fetches a file on any other origin as a public file, without credentials', async () => {
    const { reader, raw } = fakeReader();
    for (const url of ['https://bucket.s3.amazonaws.com/cv.pdf?X-Amz-Signature=s', 'https://api.vendor.example:8443/f', 'http://api.vendor.example/f', 'https://evil.api.vendor.example/f', 'not a url']) {
      await downloadSourceFile(reader, url, store, 'https://api.vendor.example', auth);
    }
    expect(raw.download).not.toHaveBeenCalled();
    expect(raw.downloadPublicFile.mock.calls.map((call) => (call as unknown[]).length)).toEqual([2, 2, 2, 2, 2]);
  });
});
