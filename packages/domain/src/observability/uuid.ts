/** `crypto.randomUUID` exists in Node and in every browser; this package is built without their type libraries. */
declare const crypto: { randomUUID(): string };

export const randomUuid = (): string => crypto.randomUUID();
