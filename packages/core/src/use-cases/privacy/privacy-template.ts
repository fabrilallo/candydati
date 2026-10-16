import type { Locale } from '@candydati/domain';

export interface TemplateParams {
  readonly language: Locale;
  readonly organizationName: string;
  /** Absent: a visible placeholder is left for the controller to fill. */
  readonly contactEmail?: string;
}

const CONTACT_PLACEHOLDER: Readonly<Record<Locale, string>> = {
  it: '[indirizzo email di contatto da inserire]',
  en: '[contact email address to be added]',
};

const ITALIAN = (org: string, contact: string): string => `Informativa sul trattamento dei dati personali dei candidati (artt. 13 e 14 del Regolamento UE 2016/679, "GDPR")

Titolare del trattamento. Il titolare è ${org}. Per qualsiasi richiesta sul trattamento dei tuoi dati puoi scrivere a ${contact}.

Quali dati trattiamo. Trattiamo i dati che ci fornisci candidandoti: nome, cognome, indirizzo email, telefono, profilo LinkedIn se lo indichi, il messaggio di presentazione e il contenuto del curriculum che carichi. Non ti chiediamo fotografia, data di nascita, genere, stato civile né dati su salute, opinioni o appartenenze: ti invitiamo a non inserirli nel curriculum.

Perché li trattiamo. Li usiamo per valutare la tua candidatura alla posizione per cui ti candidi e per comunicare con te sul processo di selezione. La base giuridica è l'esecuzione di misure precontrattuali adottate su tua richiesta (art. 6.1.b GDPR).

Database candidati. Solo se lo scegli espressamente, possiamo conservare i tuoi dati anche per valutarti per posizioni future in ${org}. In questo caso la base giuridica è il tuo consenso (art. 6.1.a GDPR), separato e facoltativo: non scegliere questa opzione non incide sulla valutazione della tua candidatura.

Come li trattiamo. Il curriculum viene letto da persone autorizzate di ${org}. Per estrarne in modo ordinato le informazioni principali (esperienze, competenze, lingue) possiamo usare strumenti automatici, compresi modelli linguistici forniti da responsabili del trattamento. Questi strumenti propongono dati da verificare: nessuna decisione sulla tua candidatura è presa in modo automatizzato e nessuna persona viene scartata da un sistema automatico.

Chi può vedere i dati. Dentro ${org} i dati sono accessibili solo a persone autorizzate: chi amministra le selezioni (titolari e amministratori dell'account e, salvo diversa scelta di ${org}, i recruiter) e il gruppo di selezione di ciascuna posizione (responsabili dell'assunzione e intervistatori), che accedono solo alle candidature delle posizioni di cui fanno parte. Ogni consultazione del profilo e del curriculum è registrata.

A chi comunichiamo i dati. I dati sono comunicati solo ai fornitori che li trattano per nostro conto (ospitalità dell'infrastruttura, invio di email, strumenti di estrazione), nominati responsabili del trattamento. Non vendiamo i tuoi dati e non li usiamo per addestrare modelli.

Per quanto tempo li conserviamo. Conserviamo i dati per il periodo indicato in questa pagina per la selezione e, se hai dato il consenso al database candidati, per il periodo indicato per quell'ambito. Alla scadenza i dati e il curriculum vengono cancellati o anonimizzati.

I tuoi diritti. Puoi chiedere l'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione, la portabilità e opporti al trattamento (artt. 15-22 GDPR). Puoi revocare in qualsiasi momento il consenso al database candidati, senza effetto sul trattamento già avvenuto. Scrivi a ${contact}.

Reclamo. Se ritieni che il trattamento violi il GDPR puoi proporre reclamo all'autorità di controllo, in Italia il Garante per la protezione dei dati personali (www.garanteprivacy.it).

Questo testo è un modello di partenza: il titolare deve verificarlo e adattarlo alla propria situazione prima di pubblicarlo.`;

const ENGLISH = (org: string, contact: string): string => `Privacy notice for job applicants (Articles 13 and 14 of Regulation (EU) 2016/679, "GDPR")

Data controller. The controller is ${org}. For any request about how your personal data is handled you can write to ${contact}.

What data we process. We process the data you give us when you apply: first and last name, email address, phone number, your LinkedIn profile if you provide it, your cover message and the content of the CV you upload. We do not ask for a photo, date of birth, gender, marital status or data about health, opinions or memberships: please do not include them in your CV.

Why we process it. We use it to assess your application for the position you applied for and to communicate with you about the selection process. The legal basis is the performance of pre-contractual steps taken at your request (Article 6(1)(b) GDPR).

Candidate database. Only if you explicitly choose so, we may also keep your data to consider you for future positions at ${org}. In that case the legal basis is your consent (Article 6(1)(a) GDPR), which is separate and optional: not choosing it does not affect the assessment of your application.

How we process it. Your CV is read by authorised people at ${org}. To pull out the main information in an orderly way (experience, skills, languages) we may use automated tools, including language models provided by data processors. These tools suggest data to be verified: no decision about your application is taken automatically and no one is rejected by an automated system.

Who can see the data. Within ${org} the data is accessible only to authorised people: those who run recruitment (account owners and administrators and, unless ${org} chooses otherwise, recruiters) and the selection team of each position (hiring managers and interviewers), who reach only the applications to the positions whose team they are on. Every view of your profile and CV is logged.

Who receives the data. The data is disclosed only to providers that process it on our behalf (infrastructure hosting, email delivery, extraction tools), appointed as data processors. We do not sell your data and we do not use it to train models.

How long we keep it. We keep the data for the period shown on this page for the selection and, if you gave consent to the candidate database, for the period shown for that scope. When it expires the data and the CV are deleted or anonymised.

Your rights. You can ask for access to your data, rectification, erasure, restriction and portability, and you can object to the processing (Articles 15-22 GDPR). You can withdraw your consent to the candidate database at any time, without affecting processing that already took place. Write to ${contact}.

Complaints. If you believe the processing breaches the GDPR you can lodge a complaint with your supervisory authority.

This text is a starting template: the controller must review it and adapt it to its own situation before publishing it.`;

/** Default privacy text for job applicants. Pure: the same params always give the same text. */
export function renderPrivacyTemplate(params: TemplateParams): string {
  const contact = params.contactEmail ?? CONTACT_PLACEHOLDER[params.language];
  return params.language === 'it' ? ITALIAN(params.organizationName, contact) : ENGLISH(params.organizationName, contact);
}
