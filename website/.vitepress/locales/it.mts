import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';
import { repoFile, sidebar } from './shared.mjs';

export const it: LocaleSpecificConfig<DefaultTheme.Config> = {
  description: "Un ATS agentico, aperto e installabile sul tuo server, pensato per chi si candida, non solo per chi seleziona.",
  themeConfig: {
    nav: [
      { text: 'Guida', link: '/it/guide/introduction', activeMatch: '^/it/guide/(?!quick-start)' },
      { text: 'Avvio rapido', link: '/it/guide/quick-start' },
      { text: 'Novità', link: repoFile('CHANGELOG.md') },
    ],
    sidebar: {
      '/it/guide/': sidebar(
        '/it/',
        { start: 'Per iniziare', run: 'Gestire la tua installazione', integrate: 'Integrazioni', project: 'Progetto' },
        {
          introduction: 'Introduzione',
          quickStart: 'Avvio rapido',
          email: 'Email',
          ai: 'Assistente AI (facoltativo)',
          operations: 'Gestione quotidiana',
          configuration: 'Configurazione',
          trackedLinks: 'Link tracciati e provenienza',
          otherDeployments: 'Altri modi di installare',
          api: 'API, webhook e MCP',
          security: 'Sicurezza e privacy',
          faq: 'Domande frequenti',
          contributing: 'Contribuire',
        },
      ),
    },
    editLink: { pattern: repoFile('website/:path'), text: 'Modifica questa pagina su GitHub' },
    footer: {
      message: 'Codice disponibile con la Business Source License 1.1.',
      copyright: '© 2026 Fabrizio Lallo',
    },
    outline: { label: 'In questa pagina' },
    docFooter: { prev: 'Pagina precedente', next: 'Pagina successiva' },
    darkModeSwitchLabel: 'Aspetto',
    lightModeSwitchTitle: 'Passa al tema chiaro',
    darkModeSwitchTitle: 'Passa al tema scuro',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Torna su',
    langMenuLabel: 'Cambia lingua',
    notFound: {
      title: 'PAGINA NON TROVATA',
      quote: 'Questa pagina non esiste o è stata spostata.',
      linkLabel: 'Vai alla home',
      linkText: 'Torna alla home',
    },
  },
};
