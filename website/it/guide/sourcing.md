# Sourcing agentico

La maggior parte degli ATS aspetta che arrivino le candidature. Gli strumenti di sourcing vanno a cercare le persone, ma
ti vendono un database, danno un punteggio a tutti e lasciano a te gli obblighi di privacy. In Candydati è l'assistente
a cercare le persone per un annuncio, dentro l'ATS che usi già. Ti mostra perché ciascuna potrebbe essere adatta, un
fatto alla volta, e la scelta resta tua. L'informativa che la legge chiede per le persone trovate così (art. 14 GDPR)
la gestisce il prodotto.

## Come funziona

Su un annuncio, chiedi all'assistente qualcosa come *"Trovami backend engineer a Torino come Giulia"*. Ogni passaggio si
vede in chat:

1. **Prima i criteri.** L'assistente legge l'annuncio, e la persona di riferimento se ne indichi una. Propone criteri
   oggettivi e legati al ruolo (competenze, ruolo, anni di esperienza, città o remoto) e aspetta che tu li confermi o li
   cambi.
2. **Quante persone.** Scegli quante persone guardare (10 di base).
3. **La ricerca.** Cerca su [GitHub](#fonti), su [LinkedIn tramite il tuo browser](#linkedin-il-rischio-detto-chiaro),
   su Google nel tuo browser e, con un agente esterno, [ovunque arrivi un client MCP](#fonti).
4. **Riscontri, non punteggi.** Per ogni persona vedi il nome, la città e, per ogni criterio, un fatto preso dal profilo
   e dove si trova ("Go: 4 anni in un'azienda di pagamenti, Esperienza"). Le persone compaiono nell'ordine in cui sono
   state trovate e non vengono mai messe in classifica. Chi è già un contatto o un candidato viene segnalato. Chi ha
   chiesto di non essere contattato viene escluso.
5. **Scegli tu.** Vengono aggiunte solo le persone che confermi, come **contatti dell'annuncio** (la scheda *Contatti
   trovati*), mai come candidati. Diventano candidati solo se si candidano.
6. **Scrivi tu.** *Testo informativa* ti dà le righe da incollare nel primo messaggio, con un link personale
   all'informativa privacy. Nessuno viene mai contattato in automatico.

## Fonti

| Fonte | Come funziona | Cosa serve |
|---|---|---|
| GitHub | Il server cerca tra gli account pubblici: linguaggi dei loro repository, città, parole nella bio | Niente. `GITHUB_TOKEN` alza i limiti di GitHub ([variabili d'ambiente](https://github.com/fabrilallo/candydati/blob/main/docs/ENVIRONMENT.md)) |
| LinkedIn | L'[estensione Chrome](./chrome-extension) legge ricerca persone e profili in una scheda visibile del **tuo** Chrome, con il **tuo** account | Un admin la attiva e fissa il massimo per ricerca; tu accetti una volta il rischio per l'account |
| Google | L'[estensione Chrome](./chrome-extension#ricerca-sul-web-google) esegue nel **tuo** Chrome la ricerca che scrive l'assistente (spesso `site:linkedin.com/in "Go" Torino`) e legge solo la pagina dei risultati | L'estensione; nessuna impostazione e nessun rischio per l'account |
| LinkedIn, mentre navighi | Il pulsante **Salva in Candydati** su ogni profilo che visiti: scegli l'annuncio, aggiungi i riscontri, fatto ([come](./chrome-extension#salvare-un-profilo-mentre-navighi)) | L'estensione |
| Agenti esterni | Claude (con il suo browser), Claude Code o qualsiasi client MCP aggiungono quello che hanno trovato con `add_sourced_contacts`; il prompt `source_people` li guida ([API e MCP](./api)) | Una chiave API con `sourcing:manage`, oppure Claude collegato come connettore |
| A mano | *Aggiungi contatto* nella scheda *Contatti trovati* dell'annuncio | Niente |

Nessun fornitore di dati a pagamento e nessun database condiviso di profili. Tutto resta sul tuo server.

## Cosa lo rende diverso

- **Mai una classifica.** L'assistente mostra fatti per criterio. Non dice mai chi è meglio, non confronta le persone e
  non scarta nessuno. Le decisioni sulle persone restano a una persona ([nessuna decisione automatica](./ai)).
- **I contatti non sono candidati.** Chi viene trovato non si è candidato. Resta sull'annuncio come contatto finché non
  si candida con il modulo normale, dando il proprio consenso.
- **L'informativa è parte del prodotto (art. 14 GDPR).** Ogni contatto ha un link personale a una pagina che mostra
  tutto quello che si conserva su di lui e da dove viene, con un pulsante per cancellarlo. Il link va con il tuo primo
  messaggio. Owner e admin possono anche scegliere di mandarla subito per email quando un indirizzo è pubblico.
- **Cancellati se nessuno scrive.** I contatti a cui nessuno scrive vengono cancellati dopo 30 giorni.
- **"Non contattatemi" vale per sempre.** Chi si oppone viene cancellato e resta solo un'impronta cifrata, così nessuno
  nell'organizzazione può aggiungerlo di nuovo.
- **Il modello non sa chi sono.** L'assistente legge nome, città e fatti. Cognomi, link ai profili, handle ed email
  vengono tolti da quello che legge e viaggiano solo come riferimenti cifrati, che il server apre quando aggiungi la
  persona ([privacy by design](./ai#privacy-by-design)).
- **Solo lettura su LinkedIn.** L'estensione non manda mai richieste di collegamento, messaggi o like. Se LinkedIn
  mostra un controllo (CAPTCHA), si ferma e lo lascia a te: non lo aggira mai.
- **Tracciato.** Aggiunte, primi messaggi, cancellazioni e opposizioni finiscono nel registro attività, con i numeri e
  mai i nomi.

## LinkedIn: il rischio, detto chiaro

I termini d'uso di LinkedIn vietano la lettura automatica dei profili, e LinkedIn può chiedere a chi ha l'account di
verificarsi, oppure limitarlo o bloccarlo. Candydati legge LinkedIn solo nel tuo browser, con il tuo account, quindi il
rischio è sul tuo account personale. Per questo:

- è **spento di base**: un owner o un admin attiva *Sourcing su LinkedIn* e fissa quanti profili al massimo può leggere
  una ricerca (Impostazioni, Privacy);
- ogni persona **accetta il rischio una volta**, con la data e la versione del testo registrate nel registro attività, e
  a ogni ricerca riceve un promemoria di una riga; una nuova versione del testo chiede di nuovo;
- la ricerca gira in un **gruppo di schede visibile** chiamato "Candydati": chiudilo per fermarla.

Se non fa per te, lascialo spento: GitHub, Google, il pulsante di salvataggio, gli agenti esterni e l'aggiunta a mano funzionano senza.

## Come attivarlo

1. Permessi: owner, admin e recruiter hanno `sourcing:manage`. Hiring manager e intervistatori no.
2. All'assistente serve un modello ([Assistente AI](./ai)).
3. Per LinkedIn: installa l'[estensione Chrome](./chrome-extension), poi attiva *Sourcing su LinkedIn* in Impostazioni,
   Privacy.
4. Facoltativo: in Impostazioni, Privacy, scegli se mandare subito l'informativa anche per email quando un indirizzo è
   pubblico (spento di base: l'informativa va con il primo messaggio).
