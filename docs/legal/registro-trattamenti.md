# Registro delle attività di trattamento (art. 30 GDPR)

> **Modello da far rivedere a un legale.** Questo documento è un template di partenza e non costituisce consulenza legale. I segnaposto tra parentesi quadre vanno compilati e il testo adattato al caso concreto prima dell'uso.

In app la pagina `/app/settings/privacy` genera questo registro con i dati dell'organizzazione. Questo file ne è il modello.

**Trattamento: Selezione del personale**
Versione: [numero] - Ultimo aggiornamento: [gg/mm/aaaa]

## Titolare e contatti

- Titolare: [Nome del titolare], [indirizzo], [codice fiscale / partita IVA]
- Contatto privacy: [indirizzo email di contatto]
- DPO, se nominato: [nome e contatto]
- Responsabile del trattamento (versione hosted): [Nome del gestore], vedi `dpa.md`

## Finalità

1. Ricevere e valutare le candidature per le posizioni aperte e comunicare con i candidati.
2. Costituire, solo con consenso, un database di candidati per posizioni future.
3. Dimostrare la correttezza del trattamento (registro delle azioni, prova del consenso).

## Base giuridica

| Finalità | Base |
|---|---|
| Selezione | Misure precontrattuali su richiesta dell'interessato (art. 6.1.b) |
| Database candidati | Consenso (art. 6.1.a), distinto, facoltativo e revocabile |
| Registro delle azioni e sicurezza | Legittimo interesse del titolare (art. 6.1.f) e obblighi di accountability (art. 5.2, 32) [da confermare con il legale] |

## Categorie di interessati

Candidati e candidate; persone di riferimento eventualmente indicate [se previsto]; utenti interni dell'azienda (recruiter, responsabili di assunzione) per i dati di accesso e il registro delle azioni.

## Categorie di dati

- Anagrafici e di contatto: nome, cognome, email, telefono, profilo LinkedIn.
- Professionali: curriculum, esperienze, competenze, lingue, messaggio di presentazione.
- Processo di selezione: fase, valutazioni e note dei selezionatori, esiti, comunicazioni, disponibilità per i colloqui.
- Consenso: versione dell'informativa, data, ambito.
- Nessuna categoria particolare di dati (art. 9) è richiesta. Il prodotto non ha campi dedicati e l'estrazione dai CV scarta foto, data di nascita e stato civile.

## Destinatari

Personale autorizzato del titolare, con permessi per ruolo e per annuncio. Responsabili e sub-responsabili: vedi `sub-responsabili.md` (hosting, storage file, email, modello linguistico, monitoraggio). [Altri destinatari: consulenti, società del gruppo, se presenti.]

## Trasferimenti verso paesi terzi

[Nessuno / elenco dei trasferimenti con paese, fornitore e garanzia: decisione di adeguatezza o clausole contrattuali standard con valutazione d'impatto del trasferimento.]

## Termini di cancellazione

| Ambito | Termine | Impostazione nell'app |
|---|---|---|
| Selezione | [N] mesi dalla conclusione del processo | Conservazione, ambito selezione |
| Database candidati (con consenso) | [N] mesi dal consenso, rinnovabile | Conservazione, ambito database candidati |
| Registro delle azioni | [N] mesi [motivazione] | [impostazione] |
| Backup | [N] giorni, poi sovrascrittura | [placeholder] |

La cancellazione è automatica: un job giornaliero avvisa prima della scadenza, poi anonimizza o cancella i dati, file compresi. Su richiesta dell'interessato la cancellazione avviene prima, dalla scheda candidato.

## Misure di sicurezza (art. 32)

- Isolamento dei dati per organizzazione: ogni tabella di dominio ha un identificativo di organizzazione e nessuna query ne prescinde.
- Cifratura in transito (TLS). [Cifratura a riposo: specificare in base all'infrastruttura.]
- Controllo degli accessi per ruolo e per annuncio, con fasi riservate.
- Registro delle azioni non modificabile (solo append), con distinzione tra azioni umane e dell'agente.
- Conservazione limitata e cancellazione automatica.
- L'agente opera con i permessi dell'utente e non decide sui candidati; ogni messaggio ai candidati richiede conferma di una persona.
- Backup e ripristino: [descrizione].
- Gestione delle violazioni: procedura di notifica entro 72 ore al Garante quando dovuta (art. 33).

## Decisioni automatizzate

Nessuna. I modelli linguistici sono usati solo per estrarre dati strutturati dai curriculum e supportare gli utenti, con verifica umana.
