import type { Recipe } from './recipe.js';

/** Writing, publishing and spreading ads. Labels quoted as they read in the app (apps/web/i18n/locales). */
export const JOB_RECIPES: readonly Recipe[] = [
  {
    id: 'create-job',
    area: 'jobs',
    permission: 'job:create',
    route: '/app/jobs/new',
    title: { it: 'Creare e pubblicare un annuncio', en: 'Create and publish a job ad' },
    steps: {
      it: [
        'Apri "Annunci" e premi "Nuovo annuncio", poi scegli "Annuncio vuoto" o "Da un template".',
        'Compila ruolo, seniority, contratto, modalità di lavoro e paese, poi in "Retribuzione" il minimo e il massimo lordo: senza fascia salariale l\'annuncio non si pubblica.',
        'Descrivi le fasi del "Processo di selezione" e i giorni entro cui rispondi ai candidati.',
        'Premi "Salva bozza", controlla con "Anteprima" e poi premi "Pubblica".',
        'Se l\'organizzazione richiede l\'approvazione, usa "Chiedi l\'approvazione" e scrivi la motivazione.',
        'Pubblicano proprietari, amministratori e recruiter; per pubblicare serve anche l\'informativa privacy dell\'organizzazione.',
      ],
      en: [
        'Open "Jobs" and press "New job ad", then pick "Blank ad" or "From a template".',
        'Fill in role, seniority, contract, work mode and country, then the gross minimum and maximum under "Salary": an ad without a salary range cannot be published.',
        'Describe the stages of the "Selection process" and the days within which you answer candidates.',
        'Press "Save draft", check it with "Preview", then press "Publish".',
        'If your organization requires approval, use "Ask for approval" and write the reason.',
        'Owners, admins and recruiters publish; publishing also needs the organization\'s privacy notice.',
      ],
    },
    keywords: {
      it: ['nuovo annuncio', 'offerta di lavoro', 'posizione', 'RAL', 'stipendio', 'pubblicare', 'bozza'],
      en: ['new job', 'job posting', 'position', 'salary range', 'publish', 'draft', 'vacancy'],
    },
  },
  {
    id: 'tracked-link',
    area: 'jobs',
    permission: 'job:publish',
    route: '/app/jobs',
    jobTab: 'distribution',
    title: { it: 'Creare un link tracciato per una sorgente', en: 'Create a tracked link for a source' },
    steps: {
      it: [
        'Apri "Annunci" e scegli un annuncio pubblicato.',
        'Vai nella scheda "Distribuzione" e cerca la sezione "Link tracciati".',
        'Scegli il "Canale" (o "Altro canale…" e scrivi il nome) e, se vuoi, una "Campagna".',
        'Premi "Copia il link tracciato" e usalo nel post, nella newsletter o nell\'annuncio esterno.',
        'Visite e candidature per canale compaiono sotto, in "Da dove arrivano visite e candidature", e in "Report", alla voce "Provenienza".',
      ],
      en: [
        'Open "Jobs" and pick a published ad.',
        'Go to the "Distribution" tab and find the "Tracked links" section.',
        'Choose the "Channel" (or "Another channel…" and type its name) and, if you like, a "Campaign".',
        'Press "Copy tracked link" and use it in the post, newsletter or external listing.',
        'Visits and applications per channel show below, in "Where visits and applications come from", and in "Reports" under "Sources".',
      ],
    },
    keywords: {
      it: ['utm', 'sorgente', 'canale', 'campagna', 'tracciamento', 'condividere', 'linkedin', 'provenienza'],
      en: ['utm', 'source', 'channel', 'campaign', 'tracking', 'share', 'linkedin', 'attribution'],
    },
  },
  {
    id: 'job-boards',
    area: 'jobs',
    permission: 'job:publish',
    route: '/app/settings/distribution',
    title: { it: 'Diffondere gli annunci su feed e job board', en: 'Spread ads to feeds and job boards' },
    steps: {
      it: [
        'Un annuncio pubblicato esce da solo nel feed XML, nell\'API pubblica e nei canali attivi: non serve un invio per ogni annuncio.',
        'Apri "Distribuzione" nella barra laterale: in "Indirizzi pubblici" copi feed XML, llms.txt, sitemap e API pubblica da dare ai portali.',
        'In "Canali collegati" proprietari e amministratori accendono o spengono i canali già collegati all\'installazione.',
        'Nella scheda "Distribuzione" di un annuncio vedi lo stato in ogni canale e puoi premere "Sincronizza di nuovo".',
        'Nuovi canali li collega chi gestisce l\'installazione, non si aggiungono dall\'app.',
      ],
      en: [
        'A published ad goes out on its own to the XML feed, the public API and the enabled channels: there is no per-ad send.',
        'Open "Distribution" in the sidebar: under "Public addresses" copy the XML feed, llms.txt, sitemap and public API to give to job boards.',
        'Under "Connected channels" owners and admins turn on or off the channels already connected to the installation.',
        'In an ad\'s "Distribution" tab you see its status in each channel and can press "Sync again".',
        'New channels are connected by whoever runs the installation, not from the app.',
      ],
    },
    keywords: {
      it: ['feed', 'xml', 'portali', 'indeed', 'sitemap', 'canali', 'multiposting', 'diffusione'],
      en: ['feed', 'xml', 'indeed', 'sitemap', 'channels', 'multiposting', 'syndication', 'distribution'],
    },
  },
  {
    id: 'job-template',
    area: 'jobs',
    permission: 'job_template:read',
    route: '/app/jobs/templates',
    title: { it: 'Usare o salvare un template di annuncio', en: 'Use or save a job ad template' },
    steps: {
      it: [
        'Per usarne uno apri "Template" e premi "Usa template", oppure da "Nuovo annuncio" scegli "Da un template".',
        'Per salvarne uno apri un annuncio, premi il menu "Altre azioni" (⋯) e scegli "Salva come template".',
        'Dai un "Nome del template" e premi "Salva template".',
      ],
      en: [
        'To use one open "Templates" and press "Use template", or from "New job ad" pick "From a template".',
        'To save one open an ad, press the "More actions" (⋯) menu and choose "Save as template".',
        'Give it a "Template name" and press "Save template".',
      ],
    },
    keywords: { it: ['modello', 'riusare', 'copia annuncio', 'duplicare'], en: ['reuse', 'copy ad', 'duplicate'] },
  },
  {
    id: 'job-request',
    area: 'jobs',
    permission: 'job:create',
    route: '/app/job-requests',
    title: { it: 'Chiedere e approvare una nuova assunzione', en: 'Request and approve a new hire' },
    steps: {
      it: [
        'Apri "Richieste" e premi "Nuova richiesta".',
        'Compila titolo della posizione, perché serve, RAL minima e massima, modalità e data di inizio, poi "Invia la richiesta".',
        'Proprietari e amministratori aprono la richiesta e premono "Approva" o "Rifiuta", con una nota se serve.',
        'Una richiesta approvata diventa annuncio con "Crea l\'annuncio" o "Prepara la bozza con l\'assistente".',
        'Sempre qui proprietari e amministratori possono attivare "Richiedi l\'approvazione prima di pubblicare un annuncio".',
      ],
      en: [
        'Open "Requests" and press "New request".',
        'Fill in position title, why the person is needed, minimum and maximum gross salary, work mode and start date, then "Send the request".',
        'Owners and admins open the request and press "Approve" or "Reject", with a note if needed.',
        'An approved request becomes an ad with "Create the ad" or "Draft it with the assistant".',
        'Here owners and admins can also turn on "Require approval before publishing an ad".',
      ],
    },
    keywords: {
      it: ['richiesta di assunzione', 'approvazione', 'budget', 'headcount', 'approvare'],
      en: ['hiring request', 'requisition', 'approval', 'budget', 'headcount'],
    },
  },
  {
    id: 'automations',
    area: 'jobs',
    permission: 'automation:manage',
    route: '/app/jobs',
    jobTab: 'automations',
    title: { it: 'Impostare le automazioni di una fase', en: 'Set up automations for a stage' },
    steps: {
      it: [
        'Apri "Annunci", scegli l\'annuncio e vai nella scheda "Automazioni".',
        'Sotto "Quando una candidatura entra in…" della fase che ti interessa premi "Aggiungi regola".',
        'In "Cosa succede" scegli "Invia un modello al candidato" (e il modello) oppure "Crea un\'attività" (testo, per chi, entro quanti giorni).',
        'Premi "Salva la regola"; con "Regola attiva" la sospendi senza cancellarla.',
        'Le automazioni non spostano candidati e non decidono esiti: lo fa sempre una persona.',
      ],
      en: [
        'Open "Jobs", pick the ad and go to the "Automations" tab.',
        'Under "When an application enters…" for the stage you want press "Add rule".',
        'Under "What happens" choose "Send a template to the candidate" (and the template) or "Create a task" (text, for whom, within how many days).',
        'Press "Save rule"; "Rule active" pauses it without deleting it.',
        'Automations never move candidates or decide outcomes: a person always does.',
      ],
    },
    keywords: {
      it: ['regola', 'automatico', 'email automatica', 'promemoria', 'workflow'],
      en: ['rule', 'automatic', 'auto email', 'reminder', 'workflow', 'trigger'],
    },
  },
];
