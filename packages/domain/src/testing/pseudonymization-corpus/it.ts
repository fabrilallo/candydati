import { plainProse } from './gaps.js';
import type { CorpusCv } from './types.js';

/** Italian CVs: invented people, reserved domains (example.*), invented numbers, the documented example IBAN. */
export const ITALIAN_CVS: readonly CorpusCv[] = [
  {
    id: 'it-1',
    language: 'it',
    firstName: 'Giulia',
    person: { lastName: 'Ferri', email: 'giulia.ferri@example.it', phone: '+39 347 555 0192' },
    text: `GIULIA FERRI
Sviluppatrice Backend
Via Giuseppe Mazzini 24, 20123 Milano (MI)
Tel. +39 347 555 0192 | giulia.ferri@example.it
linkedin.com/in/giulia-ferri-dev | github.com/gferri | giuliaferri.dev
Nata il 14/05/1991 a Bergamo
C.F. FRRGLI91E54A794K

PROFILO
Giulia Ferri, sviluppatrice backend con 8 anni di esperienza in Java, Go e Kubernetes. Mi piace lavorare in team piccoli.

ESPERIENZA
03/2020 - oggi  Backend Engineer, Satispay, Milano
- Ho guidato la migrazione a Go dei servizi di pagamento insieme a Luca Moretti e Sara Galli.
- Riportavo al CTO, l'Ing. Paolo Ricci, e coordinavo 4 persone.
2016 - 2020  Sviluppatrice Java, Reply, Torino
- Progetto per Intesa Sanpaolo con la mia responsabile Chiara Colombo.

FORMAZIONE
2010 - 2015  Laurea Magistrale in Informatica, Politecnico di Milano

COMPETENZE
Java, Go, Kubernetes, PostgreSQL, Node.js, inglese C1

REFERENZE
Dott.ssa Elena Marchetti, Head of Engineering, Satispay - elena.marchetti@example.it
Marco Fontana, Team Lead, Reply, cell. 333 555 0147`,
    mustRemove: [
      'FERRI', 'Ferri', 'Via Giuseppe Mazzini 24', '20123', '+39 347 555 0192', 'giulia.ferri@example.it', 'giulia-ferri-dev',
      'gferri', 'giuliaferri.dev', '14/05/1991', 'FRRGLI91E54A794K', 'Ricci', 'Colombo', 'Marchetti',
      'elena.marchetti@example.it', 'Fontana', '333 555 0147',
    ],
    mustKeep: [
      'GIULIA', 'Giulia', 'Satispay', 'Milano', 'Reply', 'Torino', 'Intesa Sanpaolo', 'Java', 'Go', 'Kubernetes', 'PostgreSQL',
      'Node.js', 'Politecnico di Milano', '03/2020 - oggi', '2016 - 2020', 'Head of Engineering', '8 anni',
    ],
    knownGaps: [
      { text: 'Moretti', reason: plainProse('insieme a Luca Moretti e Sara Galli') },
      { text: 'Galli', reason: plainProse('insieme a Luca Moretti e Sara Galli') },
    ],
  },
  {
    id: 'it-2',
    language: 'it',
    firstName: 'Alessandro',
    person: { lastName: 'De Luca', email: 'ale.deluca@example.com' },
    text: `Alessandro De Luca - Digital Marketing Specialist
Viale Europa 112, 00144 Roma | 06 5550 1234 | ale.deluca@example.com
Portfolio: alessandrodeluca.com | Instagram @ale.deluca.mkt | Skype: live:ale.deluca88
Nato il 3 marzo 1987 a Latina. P.IVA 01234567897
IBAN per collaborazioni: IT60 X054 2811 1010 0000 0123 456

Esperienze
2019 - oggi: consulente freelance per Eataly e Luxottica.
Ho collaborato con Francesca Rinaldi alla strategia SEO e ho seguito i report per la Sig.ra Laura Bruno, direttrice marketing.
2014 - 2019: Social Media Manager presso Ogilvy, Roma. Campagne Google Ads e Meta Ads.

Istruzione
Laurea in Scienze della Comunicazione, Università La Sapienza, 2012

Competenze: Google Analytics, SEO, HubSpot, Canva, copywriting.`,
    mustRemove: [
      'De Luca', 'Viale Europa 112', '00144', '06 5550 1234', 'ale.deluca@example.com', 'alessandrodeluca.com', '@ale.deluca.mkt',
      'live:ale.deluca88', '3 marzo 1987', '01234567897', 'IT60 X054 2811 1010 0000 0123 456', 'Bruno',
    ],
    mustKeep: [
      'Alessandro', 'Eataly', 'Luxottica', 'Ogilvy', 'Roma', 'Google Ads', 'Meta Ads', 'Google Analytics', 'HubSpot', 'SEO',
      'Università La Sapienza', 'Social Media Manager', '2019 - oggi', 'direttrice marketing',
    ],
    knownGaps: [
      { text: 'Rinaldi', reason: plainProse('Ho collaborato con Francesca Rinaldi') },
    ],
  },
  {
    id: 'it-3',
    language: 'it',
    firstName: 'Chiara',
    person: { lastName: 'Esposito' },
    text: `Curriculum Vitae - Chiara Esposito
Data Analyst

Contatti
Indirizzo: Corso Umberto I 45, 80138 Napoli
Cellulare: +39 081 555 0123
E-mail: chiara.esposito91@example.net
Telegram: @chiaraesp
Data di nascita: 21.09.1993

Esperienze professionali
Gen 2021 - oggi | Data Analyst | Accenture, Napoli
Dashboard in Power BI e modelli in Python (pandas, scikit-learn) per clienti del settore energia.
Lavoro ogni giorno con Davide Romano e Federica Greco del team di data engineering.
Set 2018 - Dic 2020 | Junior Analyst | Engineering Ingegneria Informatica, Roma

Formazione
Laurea in Statistica, Università Federico II, 2018. Relatore: prof. Giovanni Russo.
Tesi sui modelli di serie storiche (110 e lode).

Referenze disponibili su richiesta.

Lingue: inglese B2, spagnolo A2`,
    mustRemove: [
      'Esposito', 'Corso Umberto I 45', '80138', '+39 081 555 0123', 'chiara.esposito91@example.net', '@chiaraesp', '21.09.1993',
      'Russo',
    ],
    mustKeep: [
      'Chiara', 'Data Analyst', 'Accenture', 'Napoli', 'Power BI', 'Python', 'pandas', 'scikit-learn', 'Roma', 'Statistica',
      'Università Federico II', 'Gen 2021 - oggi', 'Set 2018 - Dic 2020', 'inglese B2', 'Engineering Ingegneria Informatica',
    ],
    knownGaps: [
      { text: 'Romano', reason: plainProse('Lavoro ogni giorno con Davide Romano e Federica Greco') },
      { text: 'Greco', reason: plainProse('Lavoro ogni giorno con Davide Romano e Federica Greco') },
    ],
  },
  {
    id: 'it-4',
    language: 'it',
    firstName: 'Matteo',
    person: { lastName: 'Gallo', phone: '340 555 0178' },
    text: `MATTEO GALLO
Area Manager Vendite
matteo.gallo@example.org · 340 555 0178 · Via Nizza 150/B, 10126 Torino · Twitter @mgallo_sales
Nato il 2 gennaio 1990. Patente B, automunito.
Profilo: Matteo Gallo, dodici anni di vendite nel canale Horeca.

Esperienza
2018 - oggi  Area Manager Nord-Ovest, Lavazza, Torino
Gestione di 12 agenti e di un portafoglio di 300 clienti Horeca. Responsabile diretto: Stefano Conti (stefano.conti@example.org).
Ho affiancato Roberta Villa nel lancio della linea capsule in Piemonte e Liguria.
2013 - 2018  Key Account, Ferrero, Alba

Formazione
Laurea in Economia Aziendale, Università di Torino

Competenze
Salesforce, negoziazione, Excel avanzato, inglese fluente`,
    mustRemove: [
      'GALLO', 'Gallo', 'matteo.gallo@example.org', '340 555 0178', 'Via Nizza 150/B', '10126', '@mgallo_sales', '2 gennaio 1990',
      'Conti', 'stefano.conti@example.org',
    ],
    mustKeep: [
      'MATTEO', 'Matteo', 'Area Manager', 'Lavazza', 'Torino', 'Ferrero', 'Alba', 'Horeca', 'Piemonte', 'Liguria', 'Salesforce',
      'Excel', 'Università di Torino', '2018 - oggi', '12 agenti', '300 clienti',
    ],
    knownGaps: [
      { text: 'Villa', reason: plainProse('Ho affiancato Roberta Villa') },
    ],
  },
];
