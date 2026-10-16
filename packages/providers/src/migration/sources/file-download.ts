import type { DownloadResult, DownloadStore, JsonReader, RequestExtras } from '../../http/index.js';

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * One file of a source, for every connector. A file on the connector's own API origin goes through the allowlisted
 * `download`, with the credentials in `extras`. A file anywhere else (a signed storage or CDN URL) goes through
 * `downloadPublicFile`: no credentials, public addresses only. A credential never leaves the API origin.
 */
export function downloadSourceFile(reader: JsonReader, url: string, store: DownloadStore, apiBaseUrl: string, extras?: RequestExtras): Promise<DownloadResult> {
  const apiOrigin = originOf(apiBaseUrl);
  return apiOrigin !== null && originOf(url) === apiOrigin ? reader.download(url, store, extras) : reader.downloadPublicFile(url, store);
}
