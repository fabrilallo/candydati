import { defineConfig } from 'vitepress';
import { docsBase } from '../lib/base.js';
import { en } from './locales/en.mjs';
import { it } from './locales/it.mjs';
import { REPOSITORY_URL } from './locales/shared.mjs';

const base = docsBase(process.env);

export default defineConfig({
  base,
  title: 'Candydati',
  cleanUrls: true,
  lastUpdated: false,
  // Pages that exist only to be linked from GitHub stay out of the build.
  srcExclude: ['**/README.md'],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}mark.svg` }],
    ['meta', { name: 'theme-color', content: '#1F47D6' }],
  ],
  locales: {
    root: { label: 'English', lang: 'en', ...en },
    it: { label: 'Italiano', lang: 'it', link: '/it/', ...it },
  },
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: 'Candydati' },
    siteTitle: false,
    socialLinks: [{ icon: 'github', link: REPOSITORY_URL }],
    search: {
      provider: 'local',
      options: {
        locales: {
          it: {
            translations: {
              button: { buttonText: 'Cerca', buttonAriaLabel: 'Cerca' },
              modal: {
                displayDetails: 'Mostra i dettagli',
                resetButtonTitle: 'Cancella la ricerca',
                backButtonTitle: 'Chiudi la ricerca',
                noResultsText: 'Nessun risultato per',
                footer: {
                  selectText: 'per scegliere',
                  selectKeyAriaLabel: 'invio',
                  navigateText: 'per spostarti',
                  navigateUpKeyAriaLabel: 'freccia su',
                  navigateDownKeyAriaLabel: 'freccia giù',
                  closeText: 'per chiudere',
                  closeKeyAriaLabel: 'esc',
                },
              },
            },
          },
        },
      },
    },
  },
});
