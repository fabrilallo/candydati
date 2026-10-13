import type { Locale } from '../platform/config.js';
import type { SingletonTemplateKind } from './template.js';

export interface DefaultTemplate {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
}

const it: Readonly<Record<SingletonTemplateKind, DefaultTemplate>> = {
  receipt: {
    name: 'Conferma di ricezione',
    subject: 'Abbiamo ricevuto la tua candidatura per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

grazie per aver inviato la tua candidatura per la posizione di {{ job.title }} presso {{ organization.name }}. L'abbiamo ricevuta correttamente.

Dopo ogni fase del processo ti daremo una risposta entro {{ job.responseDays }} giorni, anche quando l'esito non è quello che speravi. Puoi rileggere come funziona la selezione qui: {{ job.url }}

Se hai domande, rispondi pure a questa email: la leggerà una persona del team.

A presto,
{{ organization.name }}`,
  },
  outcome_not_selected: {
    name: 'Esito: non selezionato',
    subject: 'Esito della tua candidatura per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

grazie per il tempo e l'attenzione che hai dedicato alla candidatura per {{ job.title }} presso {{ organization.name }}.

Abbiamo valutato con cura la tua candidatura e, per questa posizione, abbiamo deciso di proseguire con altre persone. È una scelta legata a questa ricerca e non un giudizio su di te.

Se hai domande sull'esito, rispondi pure a questa email. Se in futuro una posizione ti interessa, saremo contenti di leggere di nuovo la tua candidatura.

Ti auguriamo il meglio per il tuo percorso,
{{ organization.name }}`,
  },
  outcome_hired: {
    name: 'Esito: assunzione',
    subject: 'Buone notizie sulla tua candidatura per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

abbiamo il piacere di dirti che vorremmo averti nel team di {{ organization.name }} come {{ job.title }}.

Una persona del team ti scriverà a breve per concordare insieme i prossimi passi. Se nel frattempo hai domande, rispondi pure a questa email.

Grazie per il percorso fatto con noi,
{{ organization.name }}`,
  },
  stage_update: {
    name: 'Aggiornamento sulla fase',
    subject: 'Aggiornamento sulla tua candidatura per {{ job.title }}',
    body: `Ciao {{ candidate.firstName }},

ti scriviamo per aggiornarti sulla tua candidatura per {{ job.title }} presso {{ organization.name }}: ora sei nella fase "{{ stage.name }}".

Ti faremo sapere come procede entro {{ job.responseDays }} giorni. Per vedere tutte le fasi della selezione: {{ job.url }}

Per qualsiasi dubbio, rispondi pure a questa email.

A presto,
{{ organization.name }}`,
  },
};

const en: Readonly<Record<SingletonTemplateKind, DefaultTemplate>> = {
  receipt: {
    name: 'Application received',
    subject: 'We received your application for {{ job.title }}',
    body: `Hi {{ candidate.firstName }},

thank you for applying for the {{ job.title }} position at {{ organization.name }}. We have received your application.

After each stage of the process you will hear back from us within {{ job.responseDays }} days, even when the answer is not the one you hoped for. You can read how the selection works here: {{ job.url }}

If you have any questions, just reply to this email: a person on the team will read it.

Best,
{{ organization.name }}`,
  },
  outcome_not_selected: {
    name: 'Outcome: not selected',
    subject: 'The outcome of your application for {{ job.title }}',
    body: `Hi {{ candidate.firstName }},

thank you for the time and care you put into your application for {{ job.title }} at {{ organization.name }}.

We reviewed it carefully and, for this position, we decided to move forward with other people. This is about this specific search and not a judgement of you.

If you have questions about the outcome, just reply to this email. If another position interests you in the future, we would be glad to read your application again.

We wish you all the best,
{{ organization.name }}`,
  },
  outcome_hired: {
    name: 'Outcome: hired',
    subject: 'Good news about your application for {{ job.title }}',
    body: `Hi {{ candidate.firstName }},

we are pleased to tell you that we would like you to join {{ organization.name }} as {{ job.title }}.

Someone from the team will write to you shortly to agree on the next steps. In the meantime, just reply to this email if you have questions.

Thank you for the process you went through with us,
{{ organization.name }}`,
  },
  stage_update: {
    name: 'Stage update',
    subject: 'An update on your application for {{ job.title }}',
    body: `Hi {{ candidate.firstName }},

we are writing to update you on your application for {{ job.title }} at {{ organization.name }}: you are now at the "{{ stage.name }}" stage.

We will let you know how it goes within {{ job.responseDays }} days. You can see every stage of the selection here: {{ job.url }}

If anything is unclear, just reply to this email.

Best,
{{ organization.name }}`,
  },
};

export const DEFAULT_EMAIL_TEMPLATES: Readonly<Record<Locale, Readonly<Record<SingletonTemplateKind, DefaultTemplate>>>> = {
  it,
  en,
};

export const defaultEmailTemplate = (kind: SingletonTemplateKind, locale: Locale): DefaultTemplate =>
  DEFAULT_EMAIL_TEMPLATES[locale][kind];
