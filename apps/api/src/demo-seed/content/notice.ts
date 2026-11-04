import { privacyNoticeInputSchema, type PrivacyNoticeInput } from '@candydati/domain';

/**
 * Created only when the organization has no privacy notice at all (publishing an ad needs one). It says it is a demo:
 * an organization that goes live writes its own, and the new version replaces this one.
 */
export const demoNoticeInput = (contactEmail: string): PrivacyNoticeInput =>
  privacyNoticeInputSchema.parse({
    language: 'it',
    contactEmail,
    retentionDays: { selection: 365, talent_pool: 730 },
    text: [
      'Informativa di esempio, creata dai dati dimostrativi: non è un testo legale. Prima di ricevere candidature reali, pubblica la tua informativa dalle impostazioni dell’organizzazione.',
      'Trattiamo i dati che invii con la candidatura (nome, contatti, CV e messaggio) solo per valutare la tua candidatura alla posizione scelta e, se lo accetti, per proporti posizioni future.',
      'I dati della selezione sono conservati per 12 mesi, quelli del bacino di talenti per 24 mesi; poi vengono cancellati. Puoi chiedere in ogni momento accesso, rettifica, cancellazione e copia dei tuoi dati scrivendo all’indirizzo indicato.',
    ].join('\n\n'),
  });
