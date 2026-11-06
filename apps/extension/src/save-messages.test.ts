import { describe, expect, it } from 'vitest';
import { ORIGIN_KEY, PENDING_KEY, PENDING_TTL_MS, type StorageArea } from './pending-profile.js';
import { answerExternal, isSaveMessage, saveFromLinkedin, type SaveDeps } from './save-messages.js';

/** An in-memory `chrome.storage` area: each write makes a new record, nothing is changed in place. */
const memoryArea = (initial: Record<string, unknown> = {}): StorageArea & { readonly items: () => Record<string, unknown> } => {
  let items = { ...initial };
  return {
    items: () => items,
    get: async (key) => (key in items ? { [key]: items[key] } : {}),
    set: async (more) => {
      items = { ...items, ...more };
    },
    remove: async (key) => {
      items = Object.fromEntries(Object.entries(items).filter(([name]) => name !== key));
    },
  };
};

const PROFILE = { profileUrl: 'https://it.linkedin.com/in/Giulia-Verdi?trk=x', fullName: 'Giulia Verdi', headline: 'Backend engineer', location: 'Torino, Piemonte, Italia', text: 'Giulia Verdi\nBackend engineer' };
const ALLOWED = ['https://*.candydati.it'];

const setup = (local: Record<string, unknown> = {}) => {
  let clock = 1_000_000;
  const opened: string[] = [];
  const deps: SaveDeps = {
    session: memoryArea(),
    local: memoryArea(local),
    allowed: ALLOWED,
    now: () => clock,
    openTab: async (url) => {
      opened.push(url);
    },
  };
  return { deps, opened, session: deps.session as ReturnType<typeof memoryArea>, local: deps.local as ReturnType<typeof memoryArea>, advance: (ms: number) => (clock += ms) };
};

const save = (deps: SaveDeps, profile: unknown = PROFILE, origin = 'https://www.linkedin.com') => saveFromLinkedin({ type: 'candydati.save_profile', profile }, origin, deps);

describe('save to Candydati: background', () => {
  it('recognizes only the two messages of the save flow', () => {
    expect(isSaveMessage({ type: 'candydati.hello' })).toBe(true);
    expect(isSaveMessage({ type: 'candydati.pending_profile' })).toBe(true);
    expect(isSaveMessage({ type: 'candydati.hello', extra: 1 })).toBe(false);
    expect(isSaveMessage({ type: 'candydati.search_linkedin' })).toBe(false);
  });

  it('remembers the Candydati page that says hello, only from an allowed origin', async () => {
    const { deps, local } = setup();
    expect(await answerExternal({ type: 'candydati.hello' }, 'https://evil.example', deps)).toEqual({ ok: false, error: 'failed' });
    expect(local.items()).toEqual({});
    expect(await answerExternal({ type: 'candydati.hello' }, 'https://acme.candydati.it', deps)).toEqual({ ok: true });
    expect(local.items()).toEqual({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    expect(await answerExternal({ type: 'nope' }, 'https://acme.candydati.it', deps)).toEqual({ ok: false, error: 'failed' });
  });

  it('asks to open Candydati first when no instance is known, and keeps nothing', async () => {
    const { deps, session, opened } = setup();
    expect(await save(deps)).toEqual({ ok: false, error: 'no_instance' });
    expect(session.items()).toEqual({});
    expect(opened).toEqual([]);
  });

  it('keeps the profile with a canonical link, opens the save page, and gives it once to the Candydati page', async () => {
    const { deps, opened } = setup({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    expect(await save(deps)).toEqual({ ok: true });
    expect(opened).toEqual(['https://acme.candydati.it/app/sourcing/save']);
    const answer = await answerExternal({ type: 'candydati.pending_profile' }, 'https://acme.candydati.it', deps);
    expect(answer).toEqual({ ok: true, profile: { ...PROFILE, profileUrl: 'https://www.linkedin.com/in/giulia-verdi/' } });
    expect(await answerExternal({ type: 'candydati.pending_profile' }, 'https://acme.candydati.it', deps)).toEqual({ ok: true, profile: null });
  });

  it('replaces the pending profile with the next click and refuses it after it expired', async () => {
    const { deps, session, advance } = setup({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    await save(deps);
    await save(deps, { ...PROFILE, fullName: 'Marco Bianchi', profileUrl: 'https://www.linkedin.com/in/marco-bianchi/' });
    expect((session.items()[PENDING_KEY] as { profile: { fullName: string } }).profile.fullName).toBe('Marco Bianchi');
    advance(PENDING_TTL_MS + 1);
    expect(await answerExternal({ type: 'candydati.pending_profile' }, 'https://acme.candydati.it', deps)).toEqual({ ok: true, profile: null });
  });

  it('drops an expired profile on the next hello, keeps a fresh one', async () => {
    const { deps, session, advance } = setup({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    await save(deps);
    await answerExternal({ type: 'candydati.hello' }, 'https://acme.candydati.it', deps);
    expect(session.items()[PENDING_KEY]).toBeDefined();
    advance(PENDING_TTL_MS + 1);
    await answerExternal({ type: 'candydati.hello' }, 'https://acme.candydati.it', deps);
    expect(session.items()).toEqual({});
  });

  it('refuses what does not come from LinkedIn, is not a profile, or a stored origin this build no longer answers', async () => {
    const { deps } = setup({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    expect(await save(deps, PROFILE, 'https://evil.example')).toEqual({ ok: false, error: 'failed' });
    expect(await save(deps, { ...PROFILE, profileUrl: 'https://www.linkedin.com/company/acme/' })).toEqual({ ok: false, error: 'not_a_profile' });
    expect(await save(deps, { fullName: '' })).toEqual({ ok: false, error: 'not_a_profile' });
    const other = setup({ [ORIGIN_KEY]: 'https://jobs.example.com' });
    expect(await save(other.deps)).toEqual({ ok: false, error: 'no_instance' });
  });

  it('ignores a pending record of the wrong shape or from the future', async () => {
    const { deps, session } = setup({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
    await session.set({ [PENDING_KEY]: { profile: { fullName: 'x' }, savedAt: 1 } });
    expect(await answerExternal({ type: 'candydati.pending_profile' }, 'https://acme.candydati.it', deps)).toEqual({ ok: true, profile: null });
    await session.set({ [PENDING_KEY]: { profile: PROFILE, savedAt: 9_999_999_999 } });
    expect(await answerExternal({ type: 'candydati.pending_profile' }, 'https://acme.candydati.it', deps)).toEqual({ ok: true, profile: null });
  });
});
