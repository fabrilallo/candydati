import { emailTemplateInputSchema, findUnknownVariables, type EmailTemplateInput } from '@candydati/domain';

export interface DemoTemplate {
  /** Referenced by the automations of the demo jobs. */
  readonly key: string;
  readonly input: EmailTemplateInput;
}

const template = (key: string, input: EmailTemplateInput): DemoTemplate => {
  const parsed = emailTemplateInputSchema.parse(input);
  const unknown = findUnknownVariables(parsed.subject, parsed.body);
  if (unknown.length > 0) throw new Error(`Demo template ${key} uses unknown variables: ${unknown.join(', ')}`);
  return { key, input: parsed };
};

/** Custom templates only: the four defaults stay the product's own, untouched. */
export const DEMO_TEMPLATES: readonly DemoTemplate[] = [
  template('technical-invite', {
    kind: 'custom',
    name: 'Invito al colloquio tecnico',
    subject: 'Colloquio tecnico per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

grazie per la chiacchierata: ci farebbe piacere proseguire con il colloquio tecnico per {{ job.title }}.

Dura circa 90 minuti e lo facciamo insieme, progettando una piccola API: niente quiz e niente lavagna. Rispondi a questa email con due o tre momenti in cui sei disponibile nei prossimi giorni.

Come sempre, dopo il colloquio ti risponderemo entro {{ job.responseDays }} giorni.

A presto,
{{ organization.name }}`,
  }),
  template('assignment', {
    kind: 'custom',
    name: 'Esercizio a casa: istruzioni',
    subject: 'L’esercizio per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

come anticipato, la fase successiva è un esercizio da svolgere a casa. Richiede circa tre ore e hai una settimana per consegnarlo: scegli tu quando lavorarci.

Ti mandiamo la traccia in una email separata. Se qualcosa non è chiaro, rispondi pure: preferiamo una domanda in più a un’ipotesi sbagliata.

Grazie,
{{ organization.name }}`,
  }),
  template('availability', {
    kind: 'custom',
    name: 'Richiesta di disponibilità',
    subject: 'Quando possiamo sentirci? ({{ job.title }})',
    body: `Ciao {{ candidate.firstName }},

vorremmo fissare la prossima fase della selezione per {{ job.title }}: "{{ stage.name }}".

Ci indichi due o tre momenti in cui sei disponibile nei prossimi giorni? Troverai tutte le fasi della selezione qui: {{ job.url }}

Grazie,
{{ organization.name }}`,
  }),
];
