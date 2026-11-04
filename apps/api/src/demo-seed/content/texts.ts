import type { Observation, StageType } from '@candydati/domain';

/**
 * Words people of the demo organization wrote: notes, interview feedback, client answers, tasks. Descriptions of what
 * was seen, never a mark or a rank (PRODUCT.md §2.4).
 */

export const NOTES_BY_STAGE: Readonly<Record<string, readonly string[]>> = {
  received: [
    'CV ordinato, esperienze coerenti con l’annuncio. Da sentire per una chiamata conoscitiva.',
    'Ha scritto un messaggio di accompagnamento molto chiaro sul perché le interessa il ruolo.',
  ],
  chiamata: [
    'Chiamata piacevole: cerca un contesto con più autonomia. Disponibile da gennaio.',
    'Preferisce il lavoro ibrido, le giornate in sede vanno bene. Chiede come funziona la reperibilità.',
    'Da richiamare giovedì mattina, preferisce dopo le 10.',
  ],
  default: [
    'Ha chiesto di conoscere il team prima del colloquio finale: organizziamo un caffè.',
    'Ottima impressione sul team, molto chiara nello spiegare le scelte fatte nel progetto attuale.',
    'Ha un altro processo in corso, ci chiede una risposta entro due settimane.',
  ],
  restricted: ['Allineati sulla RAL: la richiesta è dentro la fascia dell’annuncio. Preavviso di un mese.'],
};

const SHOWN: Readonly<Partial<Record<StageType, readonly string[]>>> = {
  screening_call: ['Motivata dal prodotto e dal modo di lavorare per iscritto; cerca stabilità dopo due cambi ravvicinati.'],
  technical_interview: [
    'Ha progettato dal vivo un’API per le disponibilità degli studi, con indici e transazioni ben motivati. Test chiari e ordinati.',
    'Buona padronanza di TypeScript; sul modello dei dati ha proposto due alternative e ne ha spiegato i compromessi.',
    'Ha impostato bene le rotte, meno sicuro sulla gestione degli errori e sulle migrazioni del database.',
  ],
  team_interview: ['Ha fatto domande concrete su revisioni del codice e rilasci; si è trovato a suo agio nel confronto.'],
  case_study: [
    'Ha presentato due progetti mostrando ricerca, alternative scartate e risultati misurati.',
    'Portfolio curato, ma il processo dietro le scelte è emerso solo in parte.',
  ],
  take_home_assignment: [
    'Consegna puntuale: pipeline leggibile, test sui casi limite, README con le ipotesi fatte.',
    'Ha consegnato una soluzione funzionante; manca la gestione dei dati duplicati.',
  ],
  manager_interview: ['Esperienza diretta con portafogli simili per numero di clienti; esempi concreti di rinnovi difficili.'],
  hr_interview: ['Motivazione chiara verso il ruolo; disponibile a lavorare in sede tutti i giorni.'],
  final_interview: ['Ha confermato le aspettative sul ruolo e sulle responsabilità; nessun punto bloccante emerso.'],
};

const OPEN = [
  'Esperienza limitata con le code di messaggi: da approfondire nell’incontro con il team.',
  'Da capire quanto è a suo agio a presentare il lavoro davanti a un gruppo.',
  'Vorrebbe chiarire i tempi di inserimento e chi la seguirà nei primi mesi.',
];

/** Answers to the fixed questions of a stage type, picked by a number so the same application always reads the same. */
export const feedbackAnswers = (stageType: StageType, questionIds: readonly string[], index: number): Readonly<Record<string, string>> => {
  const shown = SHOWN[stageType] ?? SHOWN.technical_interview ?? [];
  return Object.fromEntries(
    questionIds.flatMap((id) => {
      if (id === 'candidate_questions') return index % 2 === 0 ? [[id, 'Ha chiesto come funzionano formazione e revisioni del percorso.']] : [];
      if (id.endsWith('_open') || id.endsWith('_constraints')) return [[id, OPEN[index % OPEN.length] as string]];
      return [[id, shown[index % shown.length] as string]];
    }),
  );
};

export const EVIDENCE: Readonly<Record<Observation, readonly string[]>> = {
  observed: ['Lo ha mostrato con un esempio concreto del suo lavoro attuale.', 'Emerso chiaramente durante l’esercizio, con scelte motivate.'],
  not_observed: ['Non è emerso nel tempo a disposizione.', 'Ne ha parlato solo in teoria, senza esempi.'],
  to_explore: ['Qualche segnale positivo, ma serve un secondo confronto.', 'Da riprendere nella fase successiva.'],
};

export const CLIENT = {
  name: 'Ambulatori Aurora',
  website: 'https://aurora.example.com',
  contacts: [
    { id: 'paola-ferri', name: 'Paola Ferri', email: 'paola.ferri@aurora.example.com' },
    { id: 'marco-sala', name: 'Marco Sala', email: 'marco.sala@aurora.example.com' },
  ],
} as const;

export const SHORTLIST_MESSAGE =
  'Buongiorno Paola, come concordato le mando le prime tre persone per il ruolo di Data Engineer. Per ognuna trova il CV e le nostre note dopo la chiamata.';

export const CLIENT_ANSWERS = {
  meet: 'Esperienza molto vicina alla nostra: ci piacerebbe conoscerla la prossima settimana.',
  notForUs: 'Profilo interessante ma cerchiamo qualcuno con più esperienza su BigQuery.',
} as const;

export const TASKS = [
  { title: 'Richiamare per fissare il colloquio tecnico', dueInDays: 1 },
  { title: 'Mandare il riepilogo del colloquio al team', dueInDays: -1 },
  { title: 'Chiedere le referenze concordate', dueInDays: 3 },
  { title: 'Verificare la disponibilità del team per giovedì', dueInDays: 2, done: true },
  { title: 'Preparare la proposta economica', dueInDays: 2 },
] as const;
