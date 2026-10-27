import type { Recipe } from './recipe.js';

/** People, access and setup of the organization. Labels quoted as they read in the app (apps/web/i18n/locales). */
export const ORGANIZATION_RECIPES: readonly Recipe[] = [
  {
    id: 'invite-member',
    area: 'team',
    permission: 'invitation:create',
    route: '/app/settings/members',
    title: { it: 'Invitare un collega', en: 'Invite a colleague' },
    steps: {
      it: [
        'Apri "Membri" nella barra laterale.',
        'In "Invita un collega" scrivi l\'email, scegli il "Ruolo" e premi "Invia invito".',
        'Gli inviti non ancora accettati sono in "Inviti in sospeso", dove puoi annullarli.',
        'Per cambiare il ruolo di chi è già entrato, vedi la guida "Cambiare il ruolo di un membro".',
      ],
      en: [
        'Open "Members" in the sidebar.',
        'Under "Invite a colleague" type the email, choose the "Role" and press "Send invitation".',
        'Invitations not accepted yet are under "Pending invitations", where you can cancel them.',
        'To change the role of someone who already joined, see "Change a member\'s role".',
      ],
    },
    keywords: { it: ['invito', 'utente', 'aggiungere persona', 'ruolo', 'accesso'], en: ['invitation', 'user', 'add person', 'role', 'access'] },
  },
  {
    id: 'change-member-role',
    area: 'team',
    permission: 'member:update',
    route: '/app/settings/members',
    title: { it: 'Cambiare il ruolo di un membro', en: 'Change a member\'s role' },
    steps: {
      it: [
        'Apri "Membri" nella barra laterale.',
        'Accanto al nome della persona scegli il nuovo ruolo dal menu: la modifica si salva subito e finisce nel registro delle azioni.',
        'Il ruolo di proprietario lo dà o lo toglie solo un proprietario, e l\'organizzazione tiene sempre almeno un proprietario.',
        'Il tuo ruolo non lo cambi da solo: chiedilo a un altro proprietario o amministratore.',
      ],
      en: [
        'Open "Members" in the sidebar.',
        'Next to the person\'s name pick the new role from the menu: the change is saved at once and goes into the audit log.',
        'Only an owner gives or takes away the owner role, and the organization always keeps at least one owner.',
        'You do not change your own role: ask another owner or admin.',
      ],
    },
    keywords: {
      it: ['ruolo', 'collega', 'permessi', 'promuovere', 'amministratore', 'proprietario', 'accesso'],
      en: ['role', 'colleague', 'permissions', 'promote', 'admin', 'owner', 'access'],
    },
  },
  {
    id: 'job-team',
    area: 'team',
    permission: 'job_team:manage',
    route: '/app/jobs',
    jobTab: 'team',
    title: { it: 'Aggiungere persone al team di un annuncio', en: 'Add people to a job\'s team' },
    steps: {
      it: [
        'Apri "Annunci", scegli l\'annuncio e vai nella scheda "Team".',
        'In "Aggiungi una persona" scegli un membro e il "Ruolo nel team" (hiring manager, intervistatore o recruiter), poi "Aggiungi".',
        'Il ruolo nel team si cambia su ogni riga; si aggiungono solo persone già membri dell\'organizzazione.',
      ],
      en: [
        'Open "Jobs", pick the ad and go to the "Team" tab.',
        'Under "Add a person" choose a member and the "Team role" (hiring manager, interviewer or recruiter), then "Add".',
        'The team role can be changed on each row; only people who are already members can be added.',
      ],
    },
    keywords: { it: ['hiring manager', 'intervistatore', 'responsabile', 'collaboratori'], en: ['hiring manager', 'interviewer', 'owner', 'collaborators'] },
  },
  {
    id: 'two-factor',
    area: 'team',
    permission: null,
    route: '/app/settings/security',
    title: { it: 'Attivare la verifica in due passaggi', en: 'Turn on two-factor authentication' },
    steps: {
      it: [
        'Apri "Sicurezza" nella barra laterale.',
        'In "Verifica in due passaggi" scrivi la tua password e premi "Attiva".',
        'Inquadra il codice QR con l\'app di autenticazione, scrivi il "Codice dall\'app" e premi "Conferma".',
        'Salva i "Codici di riserva" in un posto sicuro.',
      ],
      en: [
        'Open "Security" in the sidebar.',
        'Under "Two-factor authentication" type your password and press "Turn on".',
        'Scan the QR code with your authenticator app, type the "Code from the app" and press "Confirm".',
        'Keep the "Backup codes" somewhere safe.',
      ],
    },
    keywords: { it: ['2fa', 'autenticazione', 'otp', 'sicurezza', 'codice'], en: ['2fa', 'mfa', 'otp', 'security', 'authenticator'] },
  },
  {
    id: 'careers-page',
    area: 'setup',
    permission: 'careers_page:manage',
    route: '/app/settings/careers',
    title: { it: 'Modificare e pubblicare la pagina carriera', en: 'Edit and publish the careers page' },
    steps: {
      it: [
        'Apri "Pagina carriera" nella barra laterale.',
        'Nella scheda "Modifica" cambia i testi, usa "Aggiungi sezione" e i pannelli per logo, tema e lingua.',
        'Controlla nella scheda "Anteprima", premi "Salva bozza" e poi "Pubblica".',
        'Se "Pubblica" è spento, correggi prima i problemi segnalati.',
      ],
      en: [
        'Open "Careers page" in the sidebar.',
        'In the "Edit" tab change the texts, use "Add section" and the panels for logo, theme and language.',
        'Check it in the "Preview" tab, press "Save draft" and then "Publish".',
        'If "Publish" is off, first fix the issues shown.',
      ],
    },
    keywords: { it: ['sito', 'lavora con noi', 'logo', 'brand', 'pagina pubblica'], en: ['website', 'careers site', 'logo', 'brand', 'public page'] },
  },
  {
    id: 'email-templates',
    area: 'setup',
    permission: 'email_template:manage',
    route: '/app/settings/email-templates',
    title: { it: 'Modificare i modelli email', en: 'Edit the email templates' },
    steps: {
      it: [
        'Apri "Modelli email" nella barra laterale.',
        'Scegli un modello o premi "Nuovo modello", dai un nome e scrivi il testo.',
        'Premi "Salva modello"; per i modelli già pronti c\'è "Ripristina il predefinito".',
      ],
      en: [
        'Open "Email templates" in the sidebar.',
        'Pick a template or press "New template", name it and write the text.',
        'Press "Save template"; built-in templates have "Restore the default".',
      ],
    },
    keywords: { it: ['template email', 'testo', 'risposta standard', 'rifiuto'], en: ['message template', 'canned response', 'rejection email'] },
  },
  {
    id: 'email-sender',
    area: 'setup',
    permission: 'email_settings:manage',
    route: '/app/settings/email',
    title: { it: 'Impostare mittente e dominio delle email', en: 'Set the sender and domain of emails' },
    steps: {
      it: [
        'Apri "Email" nella barra laterale.',
        'In "Mittente" scrivi il nome e, se vuoi, un indirizzo del vostro dominio, poi "Salva".',
        'Aggiungi al DNS i record mostrati nella sezione del dominio e premi "Verifica di nuovo": l\'indirizzo si usa solo a dominio verificato.',
        'Il servizio di invio (SMTP o Resend) lo configura chi amministra l\'installazione: finché manca, inviti, pubblicazione e candidature restano chiusi.',
      ],
      en: [
        'Open "Email" in the sidebar.',
        'Under "Sender" type the name and, if you like, an address on your domain, then "Save".',
        'Add the records shown in the domain section to your DNS and press "Check again": the address is used only once the domain is verified.',
        'The sending service (SMTP or Resend) is set by whoever runs the installation: until then invitations, publishing and applications stay closed.',
      ],
    },
    keywords: { it: ['smtp', 'dns', 'dominio', 'mittente', 'resend', 'spf', 'dkim'], en: ['smtp', 'dns', 'domain', 'sender', 'resend', 'spf', 'dkim'] },
  },
  {
    id: 'ai-models',
    area: 'setup',
    permission: 'email_settings:manage',
    route: '/app/settings/ai',
    title: { it: 'Configurare i modelli AI', en: 'Set up the AI models' },
    steps: {
      it: [
        'Apri "AI" nella barra laterale.',
        'In "Modello dell\'assistente" e "Modello rapido" accendi l\'interruttore, scegli il fornitore e il nome del modello.',
        'Inserisci la chiave API del fornitore e premi "Salva e prova i modelli".',
        'Può cambiarli solo chi amministra l\'installazione; se sono impostati dall\'ambiente la pagina li mostra in sola lettura.',
      ],
      en: [
        'Open "AI" in the sidebar.',
        'In "Assistant model" and "Fast model" turn on the switch, choose the provider and the model name.',
        'Enter the provider\'s API key and press "Save and test the models".',
        'Only whoever runs the installation can change them; when set by the environment the page shows them read-only.',
      ],
    },
    keywords: { it: ['intelligenza artificiale', 'llm', 'openai', 'anthropic', 'modello'], en: ['artificial intelligence', 'llm', 'openai', 'anthropic', 'model'] },
  },
  {
    id: 'open-assistant',
    area: 'setup',
    permission: null,
    route: '/app',
    title: { it: 'Aprire l\'assistente', en: 'Open the assistant' },
    steps: {
      it: [
        'Premi "Assistente" in alto, oppure Ctrl J (⌘J su Mac) da qualsiasi pagina.',
        'Chiedi cosa fare oggi, di scrivere o migliorare un annuncio, di preparare un messaggio o dove si trova una funzione.',
        'L\'assistente prepara bozze: pubblicare, spostare, decidere e inviare resta a te.',
      ],
      en: [
        'Press "Assistant" at the top, or Ctrl J (⌘J on Mac) from any page.',
        'Ask what to do today, to write or improve an ad, to draft a message or where a feature is.',
        'The assistant prepares drafts: publishing, moving, deciding and sending stay with you.',
      ],
    },
    keywords: { it: ['ai', 'chat', 'aiuto', 'scorciatoia'], en: ['ai', 'chat', 'copilot', 'shortcut'] },
  },
  {
    id: 'migrate-ats',
    area: 'setup',
    permission: 'migration:manage',
    route: '/app/migrations/new',
    title: { it: 'Migrare da un altro ATS', en: 'Migrate from another ATS' },
    steps: {
      it: [
        'Apri "Migrazione" e premi "Nuova migrazione".',
        'Scegli l\'origine: carica un pacchetto di migrazione oppure collega il tuo ATS o carica il suo export.',
        'Controlla analisi e anteprima, poi abbina annunci e fasi.',
        'In "Prima di migrare" spunta le dichiarazioni e premi "Conferma e migra".',
        'Una migrazione conclusa si annulla dalla lista con "Annulla migrazione".',
      ],
      en: [
        'Open "Migration" and press "New migration".',
        'Choose the source: upload a migration package, or connect your ATS or upload its export.',
        'Check the analysis and the preview, then match jobs and stages.',
        'Under "Before you migrate" tick the statements and press "Confirm and migrate".',
        'A finished migration is undone from the list with "Undo migration".',
      ],
    },
    keywords: { it: ['trasferire', 'cambiare ats', 'export', 'teamtailor', 'greenhouse'], en: ['transfer', 'switch ats', 'export', 'teamtailor', 'greenhouse'] },
  },
];
