import { rememberOrigin } from './pending-profile.js';
import { answerExternal, isSaveMessage, saveFromLinkedin, type SaveDeps } from './save-messages.js';

/**
 * The Chrome side of the "Save to Candydati" button: storage areas, the tab it opens, and the listeners. The logic is in
 * `save-messages.ts`; this file only wires it to Chrome.
 */
export function saveDeps(allowed: readonly string[]): SaveDeps {
  return {
    session: chrome.storage.session,
    local: chrome.storage.local,
    allowed,
    now: () => Date.now(),
    openTab: async (url) => {
      await chrome.tabs.create({ url, active: true });
    },
  };
}

/**
 * Answers the save-flow messages of a Candydati page (the caller already checked the origin); returns true when it took
 * the message (the answer comes later). Any other message (a search) still records where Candydati is.
 */
export function handleExternalSave(deps: SaveDeps, message: unknown, origin: string | undefined, sendResponse: (response: unknown) => void): boolean {
  if (!isSaveMessage(message)) {
    void rememberOrigin(deps.local, origin, deps.allowed);
    return false;
  }
  void answerExternal(message, origin, deps).then(sendResponse, () => sendResponse({ ok: false, error: 'failed' }));
  return true;
}

/** Listens for the content script on LinkedIn: messages from this extension only. */
export function listenForSaves(deps: SaveDeps): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return undefined;
    void saveFromLinkedin(message, sender.origin, deps).then(sendResponse, () => sendResponse({ ok: false, error: 'failed' }));
    return true;
  });
}
