# Documenti legali e privacy

> **Modello da far rivedere a un legale.** Questo documento è un template di partenza e non costituisce consulenza legale. I segnaposto tra parentesi quadre vanno compilati e il testo adattato al caso concreto prima dell'uso.

Questa cartella contiene i modelli di documento per l'uso del prodotto in una selezione del personale. Il nome compare come [Nome della piattaforma]: Candydati, o il nome configurato dall'installazione (`PLATFORM_NAME`).

## Ruoli

| Scenario | Titolare del trattamento | Responsabile del trattamento |
|---|---|---|
| Versione hosted | L'azienda cliente ([Nome del titolare]) | Il gestore del servizio ([Nome del gestore]), nominato ex art. 28 GDPR con `dpa.md` |
| Self-hosting | L'azienda che installa il software | Nessuno per la piattaforma: l'azienda è titolare e responsabile di sé stessa. I fornitori che installa (hosting, email, modello linguistico) restano suoi responsabili o sub-responsabili e vanno nominati |

In entrambi i casi la finalità e i mezzi essenziali del trattamento sono decisi dall'azienda: il gestore hosted agisce solo su sue istruzioni documentate.

## Documenti

| File | A cosa serve | Chi lo usa |
|---|---|---|
| `informativa-candidati.md` | Informativa ex art. 13, allineata al testo predefinito dell'app | Titolare, da pubblicare ai candidati |
| `registro-trattamenti.md` | Registro ex art. 30 per "Selezione del personale" | Titolare |
| `dpa.md` | Accordo sul trattamento ex art. 28 | Titolare e gestore hosted |
| `sub-responsabili.md` | Elenco dei sub-responsabili e procedura di modifica | Gestore hosted, o titolare in self-hosting |

In app, la pagina `/app/settings/privacy` mostra il registro compilato con i dati dell'organizzazione (nome, contatto, durate di conservazione, fornitori configurati).

## Cosa fa il prodotto, requisito per requisito

| Requisito | Cosa fa il prodotto | Dove |
|---|---|---|
| Informativa e consenso | Testo versionato per organizzazione. A ogni candidatura si salvano versione, data e ambito accettato | Impostazioni privacy; modello in `packages/core/src/use-cases/privacy/privacy-template.ts` |
| Ambiti di consenso separati | Singola selezione oppure, con consenso distinto e facoltativo, anche database candidati per posizioni future | Modulo di candidatura, scheda candidatura |
| Conservazione | Durata per ambito, scadenza calcolata su ogni candidato | Impostazioni privacy, sezione conservazione |
| Cancellazione automatica | Job giornaliero: avviso prima della scadenza, poi anonimizzazione o cancellazione, file compresi | `apps/worker` |
| Diritti dell'interessato | Su richiesta al contatto in informativa; il recruiter li esegue dalla scheda candidato: export, correzione, cancellazione, ritiro del consenso | Scheda candidato |
| Registro delle azioni | Chi ha visto, modificato, esportato o cancellato cosa. Solo append, non modificabile | `audit_log` |
| Minimizzazione | Nessun campo per dati particolari. L'estrazione dai CV scarta foto, data di nascita, stato civile | Modulo candidatura, estrazione CV |
| Accessi | Permessi per ruolo e per annuncio: responsabili dell'assunzione e intervistatori (e i recruiter, se l'organizzazione lo sceglie) vedono solo i candidati delle posizioni del proprio gruppo di selezione. Fasi riservate non ancora disponibili | `packages/domain/src/access/permissions.ts`, `packages/domain/src/access/job-team.ts` |
| Modelli linguistici | Fornitore configurabile, elencato tra i sub-responsabili. Nessun dato usato per addestramento. Modello locale possibile in self-hosting | `sub-responsabili.md`, variabili `AGENT_MODEL` e `FAST_MODEL` |
| Decisioni automatizzate (art. 22) | Nessuna. L'agente non ordina, non assegna punteggi e non scarta candidati; ogni messaggio ai candidati richiede conferma di una persona | Vincoli dell'agente |
| Export completo | Archivio ZIP per candidato e export dell'intera organizzazione, anche a fine contratto | Scheda candidato, esportazioni |
| Dati importati | Consenso segnato "da rinnovare", con email di riconferma | Import |
| Documenti | Questi modelli e il registro compilato in app | `docs/legal/` |

## Cosa resta a carico del titolare

- Verificare con un legale informativa, registro e accordo.
- Valutare se serve una valutazione d'impatto (DPIA) e se va nominato un DPO.
- Scegliere le durate di conservazione e motivarle.
- Istruire le persone autorizzate a usare la piattaforma.
- Gestire le richieste degli interessati entro i termini di legge (un mese, art. 12 GDPR).
