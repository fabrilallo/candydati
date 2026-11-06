import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleExternalSave, listenForSaves, saveDeps } from './background-save.js';
import { ORIGIN_KEY, type StorageArea } from './pending-profile.js';

const area = (): StorageArea & { readonly writes: Record<string, unknown>[] } => {
  const writes: Record<string, unknown>[] = [];
  return { writes, get: async () => ({}), set: async (items) => void writes.push(items), remove: async () => undefined };
};

type Listener = (message: unknown, sender: { id?: string; origin?: string }, send: (answer: unknown) => void) => boolean | undefined;

const stubChrome = () => {
  const listeners: Listener[] = [];
  const created: unknown[] = [];
  const session = area();
  const local = area();
  vi.stubGlobal('chrome', {
    runtime: { id: 'ext', onMessage: { addListener: (listener: Listener) => listeners.push(listener) } },
    storage: { session, local },
    tabs: { create: async (properties: unknown) => (created.push(properties), { windowId: 1 }) },
  });
  return { listeners, created, session, local };
};

afterEach(() => vi.unstubAllGlobals());

describe('background wiring of the save button', () => {
  it('answers the save messages of a Candydati page later, and records the origin of any other message', async () => {
    const { local } = stubChrome();
    const deps = saveDeps(['https://*.candydati.it']);
    const send = vi.fn();
    expect(handleExternalSave(deps, { type: 'candydati.hello' }, 'https://acme.candydati.it', send)).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ ok: true }));
    expect(handleExternalSave(deps, { type: 'candydati.search_linkedin' }, 'https://acme.candydati.it', send)).toBe(false);
    await vi.waitFor(() => expect(local.writes).toHaveLength(2));
    expect(local.writes[1]).toEqual({ [ORIGIN_KEY]: 'https://acme.candydati.it' });
  });

  it('takes messages from its own content script only', async () => {
    const { listeners } = stubChrome();
    listenForSaves(saveDeps(['https://*.candydati.it']));
    const send = vi.fn();
    expect(listeners[0]?.({ type: 'candydati.save_profile' }, { id: 'other' }, send)).toBeUndefined();
    expect(listeners[0]?.({ type: 'candydati.save_profile' }, { id: 'ext', origin: 'https://www.linkedin.com' }, send)).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ ok: false, error: 'not_a_profile' }));
  });

  it('opens the save page in a new, active tab', async () => {
    const { created } = stubChrome();
    const deps = saveDeps([]);
    await deps.openTab('https://acme.candydati.it/app/sourcing/save');
    expect(created).toEqual([{ url: 'https://acme.candydati.it/app/sourcing/save', active: true }]);
    expect(deps.now()).toBeGreaterThan(0);
  });
});
