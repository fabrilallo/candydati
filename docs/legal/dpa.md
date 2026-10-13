# Accordo sul trattamento dei dati personali (art. 28 GDPR)

> **Modello da far rivedere a un legale.** Questo documento è un template di partenza e non costituisce consulenza legale. I segnaposto tra parentesi quadre vanno compilati e il testo adattato al caso concreto prima dell'uso. Si applica alla sola versione hosted. In self-hosting l'azienda è titolare e responsabile di sé stessa e questo accordo non serve per la piattaforma.

Tra [Nome del titolare], [indirizzo], [codice fiscale / partita IVA] ("Titolare") e [Nome del gestore], [indirizzo], [codice fiscale / partita IVA] ("Responsabile").

## 1. Oggetto

Il Responsabile tratta dati personali per conto del Titolare per fornire la piattaforma [Nome della piattaforma] per la gestione delle selezioni, secondo il contratto di servizio [riferimento al contratto] e le istruzioni documentate del Titolare.

## 2. Durata

Dalla data di attivazione del servizio fino alla sua cessazione, più il tempo necessario alla restituzione e cancellazione dei dati (punto 11).

## 3. Natura e finalità

Raccolta, registrazione, conservazione, consultazione, estrazione di dati strutturati dai curriculum, comunicazione ai candidati, esportazione, anonimizzazione e cancellazione, al solo scopo di gestire le selezioni del Titolare. Il Responsabile non tratta i dati per finalità proprie, non li vende e non li usa per addestrare modelli.

## 4. Interessati e dati

- Interessati: candidati; utenti interni del Titolare.
- Dati: anagrafici e di contatto, curriculum e dati professionali, esiti e note di selezione, comunicazioni, consensi, dati di accesso degli utenti, registro delle azioni.
- Categorie particolari (art. 9): non richieste e senza campi dedicati. Il Titolare istruisce i candidati a non inserirle.

## 5. Obblighi del Responsabile

Il Responsabile:

1. tratta i dati solo su istruzione documentata del Titolare, anche per i trasferimenti extra UE, salvo obblighi di legge (in tal caso informa il Titolare, se consentito);
2. garantisce che le persone autorizzate siano vincolate alla riservatezza;
3. adotta le misure di sicurezza dell'Allegato A;
4. rispetta le condizioni sui sub-responsabili (punto 6);
5. assiste il Titolare per i diritti degli interessati (punto 7) e per gli artt. 32-36 (sicurezza, violazioni, DPIA, consultazione preventiva);
6. informa il Titolare se ritiene che un'istruzione violi la normativa;
7. tiene il proprio registro dei trattamenti svolti come responsabile (art. 30.2).

## 6. Sub-responsabili

Il Titolare autorizza in via generale i sub-responsabili elencati in `sub-responsabili.md`, che include i fornitori di modelli linguistici. Le modifiche seguono la procedura ivi descritta, con diritto di opposizione. Il Responsabile impone ai sub-responsabili obblighi equivalenti e risponde del loro operato.

## 7. Assistenza per i diritti degli interessati

Il Responsabile informa il Titolare entro [3] giorni lavorativi di ogni richiesta ricevuta direttamente da un interessato e non risponde senza istruzioni. La piattaforma consente al Titolare di eseguire in autonomia, dalla scheda candidato: export dei dati, correzione, cancellazione, ritiro del consenso. Il Responsabile fornisce supporto per i casi non coperti.

## 8. Violazione dei dati (data breach)

Il Responsabile notifica al Titolare ([indirizzo email]) ogni violazione senza ingiustificato ritardo e comunque entro [24-48] ore da quando ne ha conoscenza, così da permettere al Titolare di notificare al Garante entro 72 ore (art. 33). La notifica descrive natura, categorie e numero approssimativo di interessati e registrazioni, conseguenze probabili e misure adottate o proposte. Il Responsabile documenta ogni violazione e collabora alle comunicazioni agli interessati.

## 9. Audit

Il Titolare può, con preavviso di [30] giorni e non più di [una] volta l'anno salvo violazioni, verificare la conformità, direttamente o tramite un revisore vincolato alla riservatezza. Il Responsabile mette a disposizione le informazioni necessarie e contribuisce alle verifiche. Il registro delle azioni della piattaforma è consultabile dal Titolare. [Costi e modalità: da definire.]

## 10. Trasferimenti extra UE

Ammessi solo verso paesi con decisione di adeguatezza o con garanzie adeguate (clausole contrattuali standard e valutazione del trasferimento), come indicato in `sub-responsabili.md`.

## 11. Restituzione e cancellazione a fine contratto

Alla cessazione, e su richiesta del Titolare, il Responsabile mette a disposizione per [30] giorni un export completo dei dati dell'organizzazione (archivio ZIP con dati e file). Trascorso il termine, e dopo conferma del Titolare, cancella i dati e i file, compresi i backup entro [N] giorni, e rilascia una conferma scritta. Resta salva la conservazione imposta dalla legge, di cui informa il Titolare.

## 12. Responsabilità e legge applicabile

[Limitazioni di responsabilità, legge applicabile e foro competente: da definire con il legale.]

Luogo e data: [luogo], [gg/mm/aaaa]

Titolare: [firma] - Responsabile: [firma]

---

## Allegato A - Misure di sicurezza

Misure implementate dal prodotto:

| Area | Misura |
|---|---|
| Isolamento | Ogni tabella di dominio ha l'identificativo di organizzazione; nessuna query senza filtro per organizzazione. I dati di organizzazioni diverse non sono accessibili tra loro |
| Cifratura in transito | Connessioni cifrate con TLS tra utenti, applicazione, database e storage. [Verificare per ogni sub-responsabile] |
| Cifratura a riposo | [Da indicare in base al fornitore di hosting e storage] |
| Registro non modificabile | `audit_log` in sola aggiunta: chi ha visto, modificato, esportato o cancellato cosa; azioni dell'agente distinte da quelle umane |
| Controllo accessi | Permessi per ruolo e per annuncio, fasi riservate, chiavi API con ambiti per organizzazione. L'agente e gli strumenti MCP hanno gli stessi permessi dell'utente |
| Autenticazione | [Specificare: metodi, 2FA, durata sessioni] |
| Cancellazione alla scadenza | Job giornaliero di conservazione: anonimizza o cancella dati e file alla scadenza |
| Minimizzazione | Nessun campo per dati particolari; l'estrazione dai CV scarta foto, data di nascita, stato civile |
| Modelli linguistici | Accesso solo tramite il livello di astrazione della piattaforma; contenuti dei CV trattati come dati, non istruzioni; nessun addestramento |
| Backup | [Frequenza, luogo, cifratura, durata di conservazione, test di ripristino] |
| Monitoraggio e incidenti | [Procedura di rilevazione e risposta] |
| Personale | [Riservatezza, formazione, accessi del personale del Responsabile ai dati] |
