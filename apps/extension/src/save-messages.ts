import { linkedinProfileSchema, type LinkedinProfile } from '@candydati/domain';
import { z } from 'zod';
import { isAllowedOrigin, profileLink } from './linkedin-urls.js';
import { dropExpired, knownOrigin, rememberOrigin, saveUrl, savePending, takePending, type StorageArea } from './pending-profile.js';

/**
 * The messages of the "Save to Candydati" button. From the Candydati page (external): `candydati.hello` (the app is
 * open: remember where) and `candydati.pending_profile` (give and clear the pending profile). From the content script on
 * LinkedIn (internal): `candydati.save_profile` (keep this profile and open the save page of the known Candydati).
 */
export interface SaveDeps {
  readonly session: StorageArea;
  readonly local: StorageArea;
  readonly allowed: readonly string[];
  readonly now: () => number;
  readonly openTab: (url: string) => Promise<void>;
}

const LINKEDIN_ORIGIN = 'https://www.linkedin.com';

const externalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('candydati.hello') }).strict(),
  z.object({ type: z.literal('candydati.pending_profile') }).strict(),
]);

const saveSchema = z.object({ type: z.literal('candydati.save_profile'), profile: linkedinProfileSchema }).strict();

export type ExternalAnswer = { readonly ok: true; readonly profile?: LinkedinProfile | null } | { readonly ok: false; readonly error: 'failed' };
export type SaveError = 'no_instance' | 'not_a_profile' | 'failed';
export type SaveAnswer = { readonly ok: true } | { readonly ok: false; readonly error: SaveError };

/** True for the messages of the save flow a Candydati page sends (the search is answered elsewhere). */
export const isSaveMessage = (message: unknown): boolean => externalSchema.safeParse(message).success;

/** Answers a Candydati page: only the origins this build answers; every valid message also records where Candydati is. */
export async function answerExternal(message: unknown, origin: string | undefined, deps: SaveDeps): Promise<ExternalAnswer> {
  const parsed = externalSchema.safeParse(message);
  if (!parsed.success || !isAllowedOrigin(origin, deps.allowed)) return { ok: false, error: 'failed' };
  await rememberOrigin(deps.local, origin, deps.allowed);
  if (parsed.data.type === 'candydati.hello') {
    await dropExpired(deps.session, deps.now());
    return { ok: true };
  }
  return { ok: true, profile: await takePending(deps.session, deps.now()) };
}

/**
 * Keeps the profile read on a LinkedIn profile page (only from linkedin.com, only a profile address, made canonical) and
 * opens the save page of the Candydati last seen. Without one, nothing is kept: the person opens Candydati first.
 */
export async function saveFromLinkedin(message: unknown, senderOrigin: string | undefined, deps: SaveDeps): Promise<SaveAnswer> {
  if (senderOrigin !== LINKEDIN_ORIGIN) return { ok: false, error: 'failed' };
  const parsed = saveSchema.safeParse(message);
  const profileUrl = parsed.success ? profileLink(parsed.data.profile.profileUrl) : null;
  if (!parsed.success || profileUrl === null) return { ok: false, error: 'not_a_profile' };
  const origin = await knownOrigin(deps.local, deps.allowed);
  if (origin === null) return { ok: false, error: 'no_instance' };
  await savePending(deps.session, { ...parsed.data.profile, profileUrl }, deps.now());
  await deps.openTab(saveUrl(origin));
  return { ok: true };
}
