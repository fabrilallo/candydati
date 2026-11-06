import { readProfilePage } from './page-scripts.js';
import { parseProfile } from './profile-parse.js';
import type { SaveAnswer, SaveError } from './save-messages.js';

/** Runs on every LinkedIn page: the answer is checked by hand to keep the content script small (no schema library). */
const SAVE_ERRORS: readonly SaveError[] = ['no_instance', 'not_a_profile', 'failed'];

const asAnswer = (value: unknown): SaveAnswer => {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'failed' };
  const { ok, error } = value as { ok?: unknown; error?: unknown };
  if (ok === true) return { ok: true };
  return { ok: false, error: SAVE_ERRORS.find((known) => known === error) ?? 'failed' };
};

/**
 * What a click does: reads the profile the page shows (name, headline, location, address; never a photo) and hands it
 * to the background. The visible text is only used here to find the headline and location: it is not sent on.
 */
export async function saveCurrentProfile(send: (message: unknown) => Promise<unknown>): Promise<SaveAnswer> {
  const profile = parseProfile(readProfilePage());
  if (profile === null) return { ok: false, error: 'not_a_profile' };
  return asAnswer(await send({ type: 'candydati.save_profile', profile: { ...profile, text: '' } }));
}
