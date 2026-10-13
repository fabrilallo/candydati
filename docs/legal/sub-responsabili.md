# Elenco dei sub-responsabili

> **Modello da far rivedere a un legale.** Questo documento è un template di partenza e non costituisce consulenza legale. I segnaposto tra parentesi quadre vanno compilati e il testo adattato al caso concreto prima dell'uso.

Elenco dei sub-responsabili autorizzati dal titolare ai sensi dell'art. 28.2 e 28.4 GDPR, richiamato da `dpa.md`. Versione: [numero] - Aggiornato al: [gg/mm/aaaa].

Nota: i fornitori effettivi dipendono dalla configurazione. In app, la pagina `/app/settings/privacy` mostra quelli configurati. In self-hosting l'azienda compila questa tabella con i propri fornitori.

| Categoria | Fornitore | Servizio | Dati trattati | Luogo del trattamento | Garanzie per trasferimenti extra UE |
|---|---|---|---|---|---|
| Hosting dell'applicazione e del database | [Nome fornitore] | [es. server applicativo, Postgres gestito] | Tutti i dati della piattaforma, compresi dati dei candidati | [Paese e regione] | [Nessun trasferimento / decisione di adeguatezza / clausole contrattuali standard] |
| Storage di file compatibile S3 | [Nome fornitore] | [es. archiviazione dei curriculum] | File caricati (curriculum, allegati) | [Paese e regione] | [...] |
| Invio email | [Nome fornitore] | [es. invio di email transazionali ai candidati] | Indirizzo email, nome, contenuto dei messaggi | [Paese e regione] | [...] |
| Modello linguistico | [Nome fornitore] (modello: [valore di AGENT_MODEL / FAST_MODEL]) | Estrazione di dati strutturati dai curriculum e assistenza dell'agente | Testo dei curriculum e dei contenuti sottoposti | [Paese e regione] | [...]. Condizioni: nessun addestramento sui dati, [retention zero o minima], contratto che esclude l'uso per migliorare i modelli |
| Monitoraggio | [Nome fornitore] | [es. log di errore, metriche] | Metadati tecnici; nessun contenuto dei candidati (da verificare e configurare) | [Paese e regione] | [...] |

In self-hosting con modello locale la riga "Modello linguistico" può indicare che nessun dato esce dall'infrastruttura del titolare.

## Procedura di modifica

1. Il responsabile comunica per iscritto al titolare ([indirizzo email del titolare]) ogni nuovo sub-responsabile o sostituzione, con almeno [30] giorni di preavviso, indicando fornitore, servizio, dati, luogo e garanzie.
2. Il titolare può opporsi per motivi legittimi legati alla protezione dei dati entro [15] giorni dalla comunicazione.
3. In caso di opposizione le parti cercano in buona fede una soluzione. Se non è possibile, il titolare può recedere dal servizio senza penali per la parte interessata, con diritto alla restituzione dei dati.
4. Senza opposizione nel termine, il sub-responsabile si considera autorizzato.
5. Il responsabile impone a ogni sub-responsabile obblighi equivalenti a quelli del `dpa.md` e resta responsabile verso il titolare del loro adempimento.
6. In caso di urgenza (es. sostituzione per interruzione del servizio) il responsabile può agire subito, informando il titolare senza ritardo; il diritto di opposizione resta.

## Storico delle modifiche

| Data | Modifica | Fornitore |
|---|---|---|
| [gg/mm/aaaa] | [Aggiunta / sostituzione / rimozione] | [Nome] |
