import { linkedinProfileSchema, type LinkedinProfile } from '@candydati/domain';
import { z } from 'zod';
import { isAllowedOrigin } from './linkedin-urls.js';

/**
 * What the "Save to Candydati" button keeps between the click on LinkedIn and the Candydati page that picks it up: one
 * pending profile (session storage, replaced by the next click, refused after PENDING_TTL_MS, cleared once read) and the
 * origin of the Candydati page that last talked to the extension (local storage), where the save page is opened.
 */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PENDING_TTL_MS = 10 * 60_000;
export const PENDING_KEY = 'pendingProfile';
export const ORIGIN_KEY = 'instanceOrigin';
export const SAVE_PATH = '/app/sourcing/save';

const pendingSchema = z.object({ profile: linkedinProfileSchema, savedAt: z.number() });

/** Keeps `profile` as the one pending profile, in place of any earlier one. */
export async function savePending(area: StorageArea, profile: LinkedinProfile, now: number): Promise<void> {
  await area.set({ [PENDING_KEY]: { profile, savedAt: now } });
}

/** The pending profile, cleared as it is read; null when there is none, it expired or it is not a valid profile. */
export async function takePending(area: StorageArea, now: number): Promise<LinkedinProfile | null> {
  const stored = pendingSchema.safeParse((await area.get(PENDING_KEY))[PENDING_KEY]);
  await area.remove(PENDING_KEY);
  if (!stored.success || now - stored.data.savedAt > PENDING_TTL_MS || stored.data.savedAt > now) return null;
  return stored.data.profile;
}

/** Drops a pending profile nobody picked up in time (the next message to the extension does it). */
export async function dropExpired(area: StorageArea, now: number): Promise<void> {
  const stored = pendingSchema.safeParse((await area.get(PENDING_KEY))[PENDING_KEY]);
  if (stored.success && now - stored.data.savedAt <= PENDING_TTL_MS) return;
  await area.remove(PENDING_KEY);
}

/** Remembers the origin of the Candydati page that talked to the extension, when this build answers it. */
export async function rememberOrigin(area: StorageArea, origin: string | undefined, allowed: readonly string[]): Promise<void> {
  if (origin === undefined || !isAllowedOrigin(origin, allowed)) return;
  await area.set({ [ORIGIN_KEY]: new URL(origin).origin });
}

/** The Candydati origin last seen, still one this build answers; null when the person never opened Candydati. */
export async function knownOrigin(area: StorageArea, allowed: readonly string[]): Promise<string | null> {
  const origin = (await area.get(ORIGIN_KEY))[ORIGIN_KEY];
  return typeof origin === 'string' && isAllowedOrigin(origin, allowed) ? origin : null;
}

export const saveUrl = (origin: string): string => new URL(SAVE_PATH, origin).toString();
