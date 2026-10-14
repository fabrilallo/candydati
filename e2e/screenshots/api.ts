import type { Page } from '@playwright/test';

/**
 * Calls the app's own REST API from inside a signed-in page (same origin, the session cookie, the CSRF origin check
 * passes): exactly what the web client does, without clicking through every form. Returns `data` of the envelope.
 */
export const api = async <T>(page: Page, method: string, path: string, body?: unknown): Promise<T> => {
  const { status, text } = await page.evaluate(
    async ({ method, path, body }) => {
      const init: RequestInit =
        body === undefined ? { method, credentials: 'include' } : { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
      const response = await fetch(path, init);
      return { status: response.status, text: await response.text() };
    },
    { method, path, body },
  );
  if (status >= 300) throw new Error(`${method} ${path} answered ${status}: ${text.slice(0, 500)}`);
  return (JSON.parse(text) as { data: T }).data;
};

/** Uploads an image to the careers media library (multipart, like the picker dialog) and returns its id. */
export const uploadCareersImage = async (page: Page, bytes: Buffer, alt: string): Promise<string> => {
  const { status, text } = await page.evaluate(
    async ({ base64, alt }) => {
      const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const form = new FormData();
      form.append('alt.it', alt);
      form.append('file', new Blob([binary], { type: 'image/jpeg' }), 'foto.jpg');
      const response = await fetch('/api/v1/careers-page/media', { method: 'POST', credentials: 'include', body: form });
      return { status: response.status, text: await response.text() };
    },
    { base64: bytes.toString('base64'), alt },
  );
  if (status >= 300) throw new Error(`Media upload answered ${status}: ${text.slice(0, 500)}`);
  return (JSON.parse(text) as { data: { id: string } }).data.id;
};
