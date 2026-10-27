import type { Recipe } from './recipe.js';

/** Integrations, reports, exports and privacy. Labels quoted as they read in the app (apps/web/i18n/locales). */
export const DATA_RECIPES: readonly Recipe[] = [
  {
    id: 'reports',
    area: 'integrations',
    permission: 'report:read',
    route: '/app/reports',
    title: { it: 'Leggere i report', en: 'Read the reports' },
    steps: {
      it: [
        'Apri "Report" nella barra laterale.',
        'Scegli il "Periodo" e, se vuoi, un solo annuncio.',
        'Trovi tempo di assunzione, risposte nei tempi, passaggi tra le fasi e provenienza; "Esporta CSV" scarica i dati.',
      ],
      en: [
        'Open "Reports" in the sidebar.',
        'Choose the "Period" and, if you like, a single job.',
        'You find time to hire, responses on time, moves between stages and sources; "Export CSV" downloads the data.',
      ],
    },
    keywords: { it: ['statistiche', 'metriche', 'kpi', 'time to hire', 'csv', 'analisi'], en: ['statistics', 'metrics', 'kpi', 'time to hire', 'csv', 'analytics'] },
  },
  {
    id: 'webhook',
    area: 'integrations',
    permission: 'webhook:manage',
    route: '/app/settings/webhooks',
    title: { it: 'Collegare un webhook', en: 'Connect a webhook' },
    steps: {
      it: [
        'Apri "Webhook" nella barra laterale e premi "Aggiungi endpoint".',
        'Scrivi l\'URL, scegli gli "Eventi" e premi "Crea endpoint".',
        'Copia il segreto subito: si vede una volta sola. Poi premi "Ho copiato il segreto".',
      ],
      en: [
        'Open "Webhooks" in the sidebar and press "Add endpoint".',
        'Type the URL, choose the "Events" and press "Create endpoint".',
        'Copy the secret right away: it is shown only once. Then press "I copied the secret".',
      ],
    },
    keywords: { it: ['endpoint', 'eventi', 'zapier', 'make', 'n8n', 'notifica'], en: ['endpoint', 'events', 'zapier', 'make', 'n8n', 'callback'] },
  },
  {
    id: 'api-key',
    area: 'integrations',
    permission: 'api_key:manage',
    route: '/app/settings/api',
    title: { it: 'Creare una chiave API', en: 'Create an API key' },
    steps: {
      it: [
        'Apri "API e integrazioni" nella barra laterale.',
        'In "Chiavi API" premi "Nuova chiave", dai un nome, scegli cosa può fare e la scadenza, poi "Crea chiave".',
        'Copia la chiave: si vede una volta sola. Spunta "Ho salvato la chiave in un posto sicuro" e premi "Fatto".',
      ],
      en: [
        'Open "API and integrations" in the sidebar.',
        'Under "API keys" press "New key", name it, choose what it can do and the expiry, then "Create key".',
        'Copy the key: it is shown only once. Tick "I have stored the key somewhere safe" and press "Done".',
      ],
    },
    keywords: { it: ['token', 'api', 'integrazione', 'sviluppatori'], en: ['token', 'api', 'integration', 'developers'] },
  },
  {
    id: 'connect-mcp',
    area: 'integrations',
    permission: 'api_key:manage',
    route: '/app/settings/api',
    title: { it: 'Collegare un agente AI esterno (MCP)', en: 'Connect an external AI agent (MCP)' },
    steps: {
      it: [
        'Crea una chiave API (vedi la guida "Creare una chiave API").',
        'Nella stessa pagina, in "Come collegare un agente (MCP)", copia l\'indirizzo del server o premi "Copia la configurazione".',
        'Incolla la configurazione nel tuo agente e usa la chiave API come token.',
      ],
      en: [
        'Create an API key (see "Create an API key").',
        'On the same page, under "How to connect an agent (MCP)", copy the server address or press "Copy the configuration".',
        'Paste the configuration into your agent and use the API key as the token.',
      ],
    },
    keywords: { it: ['mcp', 'claude', 'chatgpt', 'cursor', 'agente'], en: ['mcp', 'claude', 'chatgpt', 'cursor', 'agent'] },
  },
  {
    id: 'export-data',
    area: 'integrations',
    permission: 'data:export',
    route: '/app/settings/data',
    title: { it: 'Esportare tutti i dati dell\'organizzazione', en: 'Export all the organization\'s data' },
    steps: {
      it: [
        'Apri "Dati" nella barra laterale e premi "Esporta tutti i dati".',
        'L\'export si prepara in background e compare in "Export richiesti".',
        'Premi "Scarica" prima che scada.',
      ],
      en: [
        'Open "Data" in the sidebar and press "Export all data".',
        'The export is prepared in the background and shows under "Requested exports".',
        'Press "Download" before it expires.',
      ],
    },
    keywords: { it: ['backup', 'scaricare', 'portabilità', 'zip'], en: ['backup', 'download', 'portability', 'zip'] },
  },
  {
    id: 'audit-log',
    area: 'integrations',
    permission: 'audit:read',
    route: '/app/settings/audit-log',
    title: { it: 'Vedere chi ha fatto cosa', en: 'See who did what' },
    steps: {
      it: ['Apri "Registro delle azioni" nella barra laterale.', 'Ogni azione ha chi l\'ha fatta, quando e su cosa; scorri le pagine per andare indietro nel tempo.'],
      en: ['Open "Audit log" in the sidebar.', 'Each action shows who did it, when and on what; page through to go back in time.'],
    },
    keywords: { it: ['audit', 'registro', 'storico', 'log', 'tracciabilità'], en: ['audit', 'history', 'log', 'activity'] },
  },
  {
    id: 'privacy-notice',
    area: 'privacy',
    permission: 'privacy:manage',
    route: '/app/settings/privacy',
    title: { it: 'Scrivere l\'informativa privacy e i tempi di conservazione', en: 'Write the privacy notice and retention periods' },
    steps: {
      it: [
        'Apri "Privacy" nella barra laterale.',
        'Compila l\'email per la privacy e il testo dell\'informativa (puoi partire da "Usa il modello").',
        'In "Per quanto tempo conservi i dati" indica i giorni per la singola selezione e per il database candidati.',
        'Premi "Pubblica la versione…" e conferma: ogni pubblicazione crea una nuova versione.',
        'I testi di consenso del modulo di candidatura seguono questi tempi e non si modificano a parte.',
      ],
      en: [
        'Open "Privacy" in the sidebar.',
        'Fill in the privacy contact email and the notice text (you can start from "Use the template").',
        'Under "How long you keep the data" set the days for the single selection and for the talent pool.',
        'Press "Publish version…" and confirm: each publish creates a new version.',
        'The consent texts of the application form follow these periods and are not edited separately.',
      ],
    },
    keywords: { it: ['gdpr', 'informativa', 'consenso', 'conservazione', 'retention'], en: ['gdpr', 'notice', 'consent', 'retention', 'data protection'] },
  },
  {
    id: 'candidate-rights',
    area: 'privacy',
    permission: 'candidate:export',
    route: '/app/candidates',
    title: { it: 'Esportare o cancellare i dati di un candidato', en: 'Export or erase a candidate\'s data' },
    steps: {
      it: [
        'Apri la scheda del candidato e vai in "Privacy e dati".',
        'In "Diritti della persona" scegli "Scarica lo ZIP", "Correggi", "Ritira il consenso" o "Cancella i dati".',
        'Per cancellare scrivi il nome completo e premi "Cancella definitivamente": non si torna indietro.',
      ],
      en: [
        'Open the candidate\'s profile and go to "Privacy and data".',
        'Under "The person\'s rights" choose "Download the ZIP", "Correct", "Withdraw consent" or "Erase the data".',
        'To erase, type the full name and press "Erase for good": it cannot be undone.',
      ],
    },
    keywords: { it: ['gdpr', 'diritto all\'oblio', 'cancellazione', 'accesso ai dati', 'portabilità'], en: ['gdpr', 'right to be forgotten', 'erasure', 'data access', 'portability'] },
  },
];
