/**
 * The extension's manifest (MV3). Permissions are the fewest a search and the save button need: open and group its own
 * tab, run the reading scripts on LinkedIn and Google results pages, keep the one profile the person chose to save until
 * Candydati picks it up (and where their Candydati is). No access to other sites, no cookies API, no background browsing
 * of tabs.
 */
export function buildManifest(version: string, origins: readonly string[]) {
  return {
    manifest_version: 3,
    name: 'Candydati',
    version,
    description: 'Lets the Candydati assistant read LinkedIn and Google in your browser when you ask, and saves the profile you view in one click.',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['tabGroups', 'scripting', 'storage'],
    host_permissions: ['https://www.linkedin.com/*', 'https://www.google.com/*'],
    // The "Save to Candydati" button. LinkedIn changes page without loading one, so the script runs on the whole site
    // and shows the button on profile pages only; it reads nothing until the person clicks it.
    content_scripts: [{ matches: ['https://www.linkedin.com/*'], js: ['content-save.js'], run_at: 'document_idle' }],
    externally_connectable: { matches: origins.map((origin) => `${origin}/*`) },
  };
}

/** `CANDYDATI_ORIGINS`: comma-separated origins or `https://*.domain` patterns of the Candydati app. */
export function parseOrigins(value: string | undefined): readonly string[] {
  const origins = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const origin of origins) {
    if (!/^https:\/\/(\*\.)?[a-z0-9.-]+$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) throw new Error(`Invalid origin in CANDYDATI_ORIGINS: ${origin}`);
  }
  if (origins.length === 0) throw new Error('CANDYDATI_ORIGINS is empty: list the origins of the Candydati app.');
  return origins;
}
