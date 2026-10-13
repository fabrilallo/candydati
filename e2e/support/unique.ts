import { randomBytes } from 'node:crypto';

/** Short unique token, safe in emails, slugs and names. */
export const token = (): string => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

export interface Identity {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export const identity = (label: string, password: string): Identity => {
  const id = token();
  return { name: `E2E ${label} ${id}`, email: `e2e-${label}-${id}@e2e.test`, password };
};

export const orgIdentity = (): { readonly name: string; readonly slug: string } => {
  const id = token();
  return { name: `E2E Org ${id}`, slug: `e2e-${id}` };
};
