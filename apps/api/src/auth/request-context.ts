import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  readonly headers: Headers;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Better Auth's organization hooks do not receive the person who performed the action (for member removal and
 * role changes `user` is the member being changed). The auth route runs the handler inside this context so the
 * hooks can resolve the acting session from the request that triggered them.
 */
export const runWithRequestHeaders = <T>(headers: Headers, run: () => Promise<T>): Promise<T> =>
  storage.run({ headers }, run);

export const currentRequestHeaders = (): Headers | null => storage.getStore()?.headers ?? null;
