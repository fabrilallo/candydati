import type { Recipe } from './recipe.js';

/** Following candidates through the process. Labels quoted as they read in the app (apps/web/i18n/locales). */
export const CANDIDATE_RECIPES: readonly Recipe[] = [
  {
    id: 'reply-waiting',
    area: 'candidates',
    permission: 'candidate:read',
    route: '/app/attention',
    title: { it: 'Rispondere ai candidati in attesa', en: 'Answer the candidates who are waiting' },
    steps: {
      it: [
        'Apri "Da gestire" nella barra laterale.',
        'Guarda le schede "In ritardo" e "In scadenza": sono le risposte promesse ai candidati.',
        'Su ogni riga premi "Scrivi" per mandare un messaggio, "Sposta in" per cambiare fase o "Apri la scheda".',
      ],
      en: [
        'Open "Needs attention" in the sidebar.',
        'Look at the "Overdue" and "Due soon" tabs: these are the answers promised to candidates.',
        'On each row press "Write" to send a message, "Move to" to change stage or "Open profile".',
      ],
    },
    keywords: {
      it: ['in ritardo', 'scadenza', 'risposta', 'attesa', 'da fare', 'promessa'],
      en: ['overdue', 'due soon', 'reply', 'waiting', 'to do', 'promise'],
    },
  },
  {
    id: 'pipeline-move',
    area: 'candidates',
    permission: 'candidate:move',
    route: '/app/jobs',
    jobTab: 'candidates',
    title: { it: 'Spostare un candidato di fase', en: 'Move a candidate to another stage' },
    steps: {
      it: [
        'Apri "Annunci", scegli l\'annuncio e vai nella scheda "Candidati".',
        'Trascina la scheda del candidato nella colonna della fase (funziona anche da tastiera).',
        'In alternativa apri il menu della scheda e scegli "Sposta in…".',
      ],
      en: [
        'Open "Jobs", pick the ad and go to the "Candidates" tab.',
        'Drag the candidate\'s card to the stage column (the keyboard works too).',
        'Or open the card menu and choose "Move to…".',
      ],
    },
    keywords: { it: ['pipeline', 'board', 'kanban', 'colonna', 'trascinare', 'colloquio'], en: ['pipeline', 'board', 'kanban', 'column', 'drag', 'interview'] },
  },
  {
    id: 'record-outcome',
    area: 'candidates',
    permission: 'candidate:decide',
    route: '/app/jobs',
    jobTab: 'candidates',
    title: { it: 'Registrare l\'esito di una candidatura', en: 'Record the outcome of an application' },
    steps: {
      it: [
        'Nella scheda "Candidati" dell\'annuncio apri il menu della scheda e scegli "Esito…".',
        'Scegli "Assunzione", "Non selezionata" o "Ritirata" e conferma con "Registra l\'esito".',
        'Ti viene proposto il modello email adatto: lo leggi, lo modifichi e lo invii tu.',
        'L\'esito lo registrano proprietari, amministratori e recruiter.',
      ],
      en: [
        'In the ad\'s "Candidates" tab open the card menu and choose "Outcome…".',
        'Pick "Hired", "Not selected" or "Withdrawn" and confirm with "Record outcome".',
        'The matching email template is proposed: you read it, edit it and send it yourself.',
        'Owners, admins and recruiters record outcomes.',
      ],
    },
    keywords: {
      it: ['rifiutare', 'scartare', 'assumere', 'assunto', 'non selezionato', 'chiudere candidatura', 'esiti'],
      en: ['reject', 'hire', 'hired', 'decline', 'close application', 'outcomes'],
    },
  },
  {
    id: 'message-candidate',
    area: 'candidates',
    permission: 'message:send',
    route: '/app/candidates',
    title: { it: 'Scrivere a un candidato', en: 'Write to a candidate' },
    steps: {
      it: [
        'Apri la scheda del candidato e vai in "Messaggi", sezione "Nuovo messaggio".',
        'Scegli un "Modello" se vuoi partire da un testo pronto, poi scrivi.',
        'Premi "Invia" e conferma: il messaggio parte solo quando lo confermi.',
        'Per più candidati insieme: nella scheda "Candidati" dell\'annuncio premi "Seleziona", spunta le schede e premi "Invia messaggio".',
      ],
      en: [
        'Open the candidate\'s profile and go to "Messages", section "New message".',
        'Pick a "Template" if you want to start from a ready text, then write.',
        'Press "Send" and confirm: the message goes only when you confirm.',
        'For several candidates at once: in the ad\'s "Candidates" tab press "Select", tick the cards and press "Send message".',
      ],
    },
    keywords: { it: ['email', 'messaggio', 'contattare', 'inviare', 'massivo'], en: ['email', 'message', 'contact', 'send', 'bulk'] },
  },
  {
    id: 'interview-feedback',
    area: 'candidates',
    permission: 'feedback:manage',
    route: '/app/candidates',
    title: { it: 'Chiedere un feedback dopo il colloquio', en: 'Ask for interview feedback' },
    steps: {
      it: [
        'Indica chi fa i colloqui: nell\'annuncio, in "Chi fa il colloquio", premi "Aggiungi" (anche una persona esterna al team).',
        'Apri la scheda del candidato e vai in "Feedback".',
        'Premi "Chiedi feedback", scegli la "Fase del colloquio" e, se serve, "Chiedilo a un\'altra persona".',
        'Premi "Invia la richiesta": la persona riceve un link personale e non le serve un account.',
      ],
      en: [
        'Set who interviews: in the ad, under "Who interviews", press "Add" (someone outside the team works too).',
        'Open the candidate\'s profile and go to "Feedback".',
        'Press "Ask for feedback", choose the "Interview stage" and, if needed, "Ask someone else".',
        'Press "Send the request": the person gets a personal link and needs no account.',
      ],
    },
    keywords: { it: ['intervistatore', 'colloquio', 'valutazione', 'scorecard'], en: ['interviewer', 'interview', 'scorecard', 'evaluation'] },
  },
  {
    id: 'follow-up-task',
    area: 'candidates',
    permission: 'task:manage',
    route: '/app/candidates',
    title: { it: 'Creare un\'attività di follow-up', en: 'Create a follow-up task' },
    steps: {
      it: [
        'Apri la scheda del candidato (anche dal pannello che si apre nella pipeline) e vai in "Attività".',
        'Scrivi l\'attività, scegli a chi è "Assegnata a" e la "Scadenza", poi premi "Aggiungi attività".',
        'Le tue attività le trovi in "Le mie attività", divise tra scadute, di oggi e prossime.',
      ],
      en: [
        'Open the candidate\'s profile (also from the panel that opens in the pipeline) and go to "Tasks".',
        'Write the task, choose who it is "Assigned to" and the "Due date", then press "Add task".',
        'Your tasks are in "My tasks", grouped as overdue, today and upcoming.',
      ],
    },
    keywords: { it: ['promemoria', 'todo', 'richiamare', 'scadenza'], en: ['reminder', 'todo', 'call back', 'due date'] },
  },
  {
    id: 'import-cvs',
    area: 'candidates',
    permission: 'import:manage',
    route: '/app/imports/new',
    title: { it: 'Importare CV o un foglio di candidati', en: 'Import CVs or a sheet of candidates' },
    steps: {
      it: [
        'Apri "Import" e premi "Nuovo import".',
        'Carica CV in PDF o DOCX, uno ZIP oppure un CSV o Excel.',
        'In "Dove vanno i candidati" scegli l\'annuncio e la fase di partenza, poi "Carica e analizza".',
        'Per i fogli controlla le colonne, guarda l\'anteprima e premi "Importa".',
        'Un import finito si annulla dalla lista con "Annulla import".',
      ],
      en: [
        'Open "Import" and press "New import".',
        'Upload PDF or DOCX CVs, a ZIP, or a CSV or Excel file.',
        'Under "Where the candidates go" choose the job and the starting stage, then "Upload and analyse".',
        'For sheets check the columns, look at the preview and press "Import".',
        'A finished import is undone from the list with "Undo import".',
      ],
    },
    keywords: { it: ['caricare', 'curriculum', 'excel', 'csv', 'zip', 'massivo'], en: ['upload', 'resume', 'excel', 'csv', 'zip', 'bulk'] },
  },
];
