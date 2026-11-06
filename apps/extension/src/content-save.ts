import { createSaveButton, isProfilePath, watchLocation } from './save-button.js';
import { saveCurrentProfile } from './save-click.js';

/** The product name, set at build time (`CANDYDATI_EXTENSION_NAME`, default "Candydati"). */
declare const __CANDYDATI_NAME__: string;

/**
 * Content script on www.linkedin.com: the "Save to Candydati" button, visible on profile pages only. It reads the page
 * only when the person clicks, and never clicks, types or changes anything of LinkedIn.
 */
const button = createSaveButton(document, {
  name: __CANDYDATI_NAME__,
  language: navigator.language,
  onSave: () => saveCurrentProfile((message) => chrome.runtime.sendMessage(message)),
});
watchLocation(
  () => location.href,
  (href) => button.setVisible(isProfilePath(new URL(href).pathname)),
);
