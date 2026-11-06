/**
 * The extension's manifest (MV3). Permissions are the fewest a search needs: open and group its own tab, run the
 * reading scripts on LinkedIn pages. No access to other sites, no storage, no cookies API, no background browsing of
 * tabs the person opened.
 */
export function buildManifest(version: string, origins: readonly string[]) {
  return {
    manifest_version: 3,
    name: 'Candydati',
    version,
    description: 'Lets the Candydati assistant read LinkedIn search results and profiles in your own browser, when you ask it to.',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['tabGroups', 'scripting'],
    host_permissions: ['https://www.linkedin.com/*'],
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
