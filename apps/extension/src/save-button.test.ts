// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonLabel, createSaveButton, isProfilePath, watchLocation, type SaveButton } from './save-button.js';
import { saveCurrentProfile } from './save-click.js';

const created: SaveButton[] = [];
afterEach(() => {
  created.splice(0).forEach((button) => button.destroy());
  vi.useRealTimers();
});

const make = (onSave: () => Promise<never> | Promise<{ ok: true } | { ok: false; error: 'no_instance' }>, language = 'en-US') => {
  const button = createSaveButton(document, { name: 'Candydati', language, onSave, resultMs: 400 });
  created.push(button);
  return button;
};

describe('save button', () => {
  it('speaks Italian or English by the browser language', () => {
    expect(buttonLabel('idle', 'Candydati', 'it-IT')).toBe('Salva in Candydati');
    expect(buttonLabel('no_instance', 'Candydati', 'it')).toBe('Apri Candydati una volta, poi riprova');
    expect(buttonLabel('idle', 'Candydati', 'en-GB')).toBe('Save to Candydati');
    expect(buttonLabel('opened', 'Candydati', 'de-DE')).toBe('Opened in Candydati');
    expect(['busy', 'not_a_profile', 'failed'].map((state) => buttonLabel(state as 'busy', 'X', 'en'))).toEqual(['Saving…', 'Could not read this profile', 'Something went wrong, try again']);
    expect(['busy', 'opened', 'not_a_profile', 'failed'].map((state) => buttonLabel(state as 'busy', 'X', 'it'))).toEqual(['Salvataggio…', 'Aperto in X', 'Non riesco a leggere questo profilo', 'Qualcosa non ha funzionato, riprova']);
  });

  it('shows only on a profile page', () => {
    expect(isProfilePath('/in/giulia-verdi/')).toBe(true);
    expect(isProfilePath('/in/giulia-verdi')).toBe(true);
    expect(isProfilePath('/in/giulia-verdi/details/experience/')).toBe(false);
    expect(isProfilePath('/feed/')).toBe(false);
  });

  it('starts hidden, reads nothing until clicked, then shows the outcome and goes back to "Save"', async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    const button = make(onSave);
    expect(button.host.hidden).toBe(true);
    button.setVisible(true);
    expect(button.host.hidden).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(button.button.textContent).toBe('Save to Candydati');
    button.button.click();
    expect(button.button.textContent).toBe('Saving…');
    button.button.click();
    await vi.waitFor(() => expect(button.button.textContent).toBe('Opened in Candydati'));
    expect(onSave).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(button.button.textContent).toBe('Save to Candydati'));
  });

  it('says why it could not save, also when the background fails', async () => {
    const missing = make(async () => ({ ok: false, error: 'no_instance' }) as const, 'it-IT');
    missing.button.click();
    await vi.waitFor(() => expect(missing.button.textContent).toBe('Apri Candydati una volta, poi riprova'));
    const broken = make(() => Promise.reject(new Error('gone')));
    broken.button.click();
    await vi.waitFor(() => expect(broken.button.textContent).toBe('Something went wrong, try again'));
  });

  it('follows the address of a single-page app until stopped', () => {
    vi.useFakeTimers();
    let href = 'https://www.linkedin.com/feed/';
    const seen: string[] = [];
    const stop = watchLocation(() => href, (value) => seen.push(value), 100);
    vi.advanceTimersByTime(100);
    href = 'https://www.linkedin.com/in/giulia-verdi/';
    vi.advanceTimersByTime(100);
    stop();
    href = 'https://www.linkedin.com/in/other/';
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(['https://www.linkedin.com/feed/', 'https://www.linkedin.com/in/giulia-verdi/']);
  });
});

describe('save click', () => {
  it('sends the name, headline, location and address, without the page text', async () => {
    document.title = 'Giulia Verdi | LinkedIn';
    document.body.innerHTML = '<main><h1>Giulia Verdi</h1><p>Backend engineer at Acme</p><p>Torino, Piemonte, Italia</p></main>';
    const sent: unknown[] = [];
    const answer = await saveCurrentProfile(async (message) => (sent.push(message), { ok: true }));
    expect(answer).toEqual({ ok: true });
    expect(sent).toEqual([{ type: 'candydati.save_profile', profile: expect.objectContaining({ fullName: 'Giulia Verdi', text: '' }) }]);
  });

  it('refuses a page without a name and an answer of the wrong shape', async () => {
    document.title = 'LinkedIn';
    document.body.innerHTML = '<main></main>';
    expect(await saveCurrentProfile(async () => ({ ok: true }))).toEqual({ ok: false, error: 'not_a_profile' });
    document.body.innerHTML = '<main><h1>Giulia Verdi</h1></main>';
    expect(await saveCurrentProfile(async () => undefined)).toEqual({ ok: false, error: 'failed' });
    expect(await saveCurrentProfile(async () => ({ ok: false, error: 'no_instance' }))).toEqual({ ok: false, error: 'no_instance' });
    expect(await saveCurrentProfile(async () => ({ ok: false, error: 'boom' }))).toEqual({ ok: false, error: 'failed' });
  });
});
