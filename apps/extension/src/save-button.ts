import type { SaveAnswer, SaveError } from './save-messages.js';

/**
 * The floating "Save to Candydati" button shown on LinkedIn profiles. It lives in a closed shadow root, so LinkedIn's
 * styles do not reach it and it changes nothing of the page; it reads nothing by itself: `onSave` runs on a click only.
 */
export type ButtonState = 'idle' | 'busy' | 'opened' | SaveError;

/** How long a result stays on the button before it goes back to "Save". */
export const RESULT_MS = 4000;

type Words = Readonly<Record<ButtonState, (name: string) => string>>;

const EN: Words = {
  idle: (name) => `Save to ${name}`,
  busy: () => 'Saving…',
  opened: (name) => `Opened in ${name}`,
  no_instance: (name) => `Open ${name} once, then try again`,
  not_a_profile: () => 'Could not read this profile',
  failed: () => 'Something went wrong, try again',
};

const IT: Words = {
  idle: (name) => `Salva in ${name}`,
  busy: () => 'Salvataggio…',
  opened: (name) => `Aperto in ${name}`,
  no_instance: (name) => `Apri ${name} una volta, poi riprova`,
  not_a_profile: () => 'Non riesco a leggere questo profilo',
  failed: () => 'Qualcosa non ha funzionato, riprova',
};

/** The button text in Italian when the browser speaks Italian, in English otherwise (no i18n in a content script). */
export const buttonLabel = (state: ButtonState, name: string, language: string): string => (/^it\b/i.test(language) ? IT : EN)[state](name);

/** A LinkedIn profile page (`/in/<handle>/`), not one of its sub-pages nor any other page. */
export const isProfilePath = (pathname: string): boolean => /^\/in\/[^/]+\/?$/.test(pathname);

/** Ink on paper, one yellow dot, the hard offset shadow of the design system. */
const STYLE = `
:host { all: initial; }
button { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px;
  max-width: 320px; padding: 8px 14px; border: 2px solid #1B1530; border-radius: 999px; background: #FBFAF7; color: #1B1530;
  box-shadow: 3px 3px 0 #1B1530; font: 600 14px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; cursor: pointer; }
button:hover { background: #F1EEE8; }
button:focus-visible { outline: 2px solid #1B1530; outline-offset: 3px; }
button[aria-busy="true"] { cursor: progress; }
.dot { width: 10px; height: 10px; flex: none; border-radius: 999px; background: #FFD54F; border: 1.5px solid #1B1530; }
`;

export interface SaveButtonOptions {
  readonly name: string;
  readonly language: string;
  readonly onSave: () => Promise<SaveAnswer>;
  readonly resultMs?: number;
}

export interface SaveButton {
  readonly host: HTMLElement;
  readonly button: HTMLButtonElement;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/** Adds the (hidden) button to the page; `setVisible` shows it on profile pages only. */
export function createSaveButton(doc: Document, options: SaveButtonOptions): SaveButton {
  const host = doc.createElement('candydati-save');
  host.hidden = true;
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-live', 'polite');
  const dot = doc.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = doc.createElement('span');
  button.append(dot, label);
  root.append(style, button);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (state: ButtonState): void => {
    label.textContent = buttonLabel(state, options.name, options.language);
    button.setAttribute('aria-busy', String(state === 'busy'));
  };
  show('idle');

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-busy') === 'true') return;
    clearTimeout(timer);
    show('busy');
    void options
      .onSave()
      .catch((): SaveAnswer => ({ ok: false, error: 'failed' }))
      .then((answer) => {
        show(answer.ok ? 'opened' : answer.error);
        timer = setTimeout(() => show('idle'), options.resultMs ?? RESULT_MS);
      });
  });

  (doc.body ?? doc.documentElement).append(host);
  return {
    host,
    button,
    setVisible: (visible) => {
      host.hidden = !visible;
    },
    destroy: () => {
      clearTimeout(timer);
      host.remove();
    },
  };
}

/**
 * LinkedIn is a single-page app: the address changes without a page load. Calls `onChange` with the first address and
 * with every new one (checked every `intervalMs`); returns a function that stops watching.
 */
export function watchLocation(read: () => string, onChange: (href: string) => void, intervalMs = 800): () => void {
  let last = read();
  onChange(last);
  const id = setInterval(() => {
    const href = read();
    if (href === last) return;
    last = href;
    onChange(href);
  }, intervalMs);
  return () => clearInterval(id);
}
