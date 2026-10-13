import { InvalidStorageKeyError } from './types.js';

/** Upper case is allowed: Better Auth organization ids are mixed-case and end up in the key. */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,250}$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes('..') && !key.includes('//') && !key.endsWith('/');
}

/** Returns the key unchanged or throws; every storage implementation calls it first. */
export function assertStorageKey(key: string): string {
  if (!isValidStorageKey(key)) throw new InvalidStorageKeyError(key);
  return key;
}
