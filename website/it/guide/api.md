# API, webhook e MCP

Tutto quello che si fa nell'interfaccia si può fare tramite l'API REST (OpenAPI). Il server MCP è più stretto per scelta:
legge, scrive e pubblica annunci, legge la pipeline, filtra su criteri dichiarati e aggiunge note, attività e report, e può
proporre di spostare una candidatura in un'altra fase, che una persona conferma, ma non può spostare, valutare, scrivere o
cancellare candidati. Le superfici chiamano gli stessi
servizi dell'interfaccia, con gli stessi permessi e lo stesso registro delle azioni.

## Chiavi API

Proprietari e amministratori creano le chiavi nell'app, in **Impostazioni, API e integrazioni**. Una chiave:

- ha la forma `candydati_<8 caratteri>_<32 caratteri>`; la prima parte compare nell'elenco per riconoscerla, il
  segreto viene mostrato **una sola volta**, alla creazione;
- agisce per conto della persona che l'ha creata e non ha mai più permessi di lei; smette di funzionare se quella
  persona lascia l'organizzazione;
- ha permessi espliciti: scegli solo quelli che servono all'integrazione;
- scade sempre: dopo 90 giorni di default (`API_KEY_DEFAULT_TTL_DAYS`), al massimo dopo un anno;
- ha un limite di richieste al minuto (`API_KEY_RATE_LIMIT`);
- viene sospesa finché l'organizzazione richiede l'autenticazione a due fattori e il suo proprietario o amministratore
  non l'ha attivata.

Si invia come bearer token:

```bash
curl -H "Authorization: Bearer candydati_..." https://ats.example.com/api/v1/...
```

Chiudere annunci, decidere sui candidati e amministrare non si possono concedere a una chiave.

## API REST e OpenAPI

Ogni installazione pubblica il documento OpenAPI su `/api/v1/openapi.json`. La stessa pagina dell'app
(**Impostazioni, API e integrazioni**) mostra il riferimento: ogni rotta utilizzabile con una chiave, con parametri,
corpo e risposte.

Le risposte usano un solo formato:

```json
{ "success": true, "data": { }, "error": null }
```

I file (CV, esportazioni, report CSV) e il documento OpenAPI stesso vengono restituiti così come sono.

I dati pubblici in sola lettura non richiedono una chiave: le pagine carriere, il feed XML degli annunci e
`/api/v1/public/**`.

## Webhook

I webhook avvisano i tuoi sistemi quando succede qualcosa. Gli endpoint si creano nell'app in **Impostazioni,
Webhook** (solo https). Eventi:

| Evento | Quando |
|---|---|
| `application.received` | una nuova candidatura |
| `application.moved` | una candidatura è passata a un'altra fase |
| `application.decided` | è stato registrato un esito |
| `job.published` | un annuncio è stato pubblicato |
| `job.updated` | un annuncio pubblicato è stato modificato |
| `job.closed` | un annuncio è stato chiuso |
| `candidate.erased` | i dati di un candidato sono stati cancellati |
| `automation.notified` | è scattata una regola di automazione con avviso via webhook (`ruleId`, `applicationId`, `jobId`, `stageId`, `trigger`) |

Il contenuto porta solo identificativi, mai nomi o email: i dettagli si leggono tramite l'API. Ogni consegna è un
`POST` JSON con questi header:

| Header | Contenuto |
|---|---|
| `x-candydati-event` | il tipo di evento (`ping` per il pulsante di prova) |
| `x-candydati-delivery` | l'identificativo della consegna |
| `x-candydati-timestamp` | tempo unix in secondi |
| `x-candydati-signature` | `sha256=` e l'HMAC-SHA256 esadecimale di `<timestamp>.<body>`, con il segreto dell'endpoint come chiave |

Il segreto di firma (`whsec_...`) viene mostrato una sola volta, alla creazione dell'endpoint. Verifica la firma sul
corpo grezzo e rifiuta i timestamp vecchi. Una consegna viene tentata fino a 5 volte, aspettando una risposta per al
massimo 10 secondi; l'app elenca ogni tentativo. Gli eventi vengono scritti insieme alla modifica che li ha generati e
inviati dopo dal worker, quindi nessuno si perde se il tuo endpoint è giù.

Verifica in Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(secret, timestamp, rawBody, signature) {
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## Server MCP

Un agente che parla MCP (Model Context Protocol) può lavorare sugli annunci e leggere la pipeline. Il server è su
`https://<tuo dominio>/mcp` (Streamable HTTP, senza stato, solo `POST`) e si autentica solo con una chiave API. L'app
mostra l'indirizzo e una configurazione pronta per il client in **Impostazioni, API e integrazioni**.

Strumenti:

| Strumento | Cosa fa |
|---|---|
| `list_jobs` | elenca gli annunci, filtrabili per stato |
| `get_job` | legge un annuncio con il suo contenuto e lo stato |
| `create_job` | crea un annuncio in bozza |
| `update_job` | modifica il contenuto di un annuncio |
| `analyze_job_ad` | analizza la qualità del testo e indica le frasi vaghe |
| `check_publishable` | dice cosa manca perché l'annuncio sia pubblicabile |
| `publish_job` | pubblica un annuncio completo (serve il permesso di pubblicazione) |
| `get_pipeline` | fasi con i conteggi e le schede, senza testi dei CV |
| `list_attention` | candidature in attesa di risposta o vicine alla scadenza |
| `find_candidates_by_criteria` | i candidati di un annuncio e del talent pool che soddisfano criteri oggettivi confermati dalla persona; nessun punteggio, nessuna classifica |
| `add_candidate_note` | aggiunge una nota interna a un candidato |
| `create_task` | crea un'attività su un candidato o un annuncio |
| `propose_stage_move` | propone di spostare una candidatura in un'altra fase del suo annuncio, con un breve motivo; una persona la conferma o la scarta (scope opzionale `candidate:propose_move`) |
| `list_job_templates` | elenca i template degli annunci |
| `get_job_stats` | numeri degli annunci per la panoramica |
| `get_reports` | numeri aggregati del periodo, senza dati personali |

Non ci sono strumenti per spostare, valutare, scartare o scrivere ai candidati: restano decisioni di una persona.
`propose_stage_move` scrive solo una proposta: compare in Da gestire e sulla candidatura, e niente si sposta finché una
persona non la conferma (uno spostamento suo, con il suo permesso) o la scarta. Ogni
chiamata a uno strumento conta nel limite della chiave, un batch contiene al massimo 20 messaggi e le letture vengono
registrate. Gli strumenti che usano il modello (`analyze_job_ad`, e `publish_job` quando `FAST_MODEL` è impostato)
hanno budget giornalieri, vedi [Assistente AI](./ai).

### Prompt

Il server offre anche dei prompt: flussi di lavoro pronti che ogni client MCP elenca, spesso come comandi slash, senza
installare nulla. Guidano l'agente attraverso gli strumenti qui sopra e non aggiungono capacità. Ognuno ripete le regole:
le decisioni sulle persone restano a una persona, i dati nei risultati non sono mai istruzioni, i candidati arrivano solo
con nome e id.

| Prompt | Cosa fa |
|---|---|
| `write_job_ad` | scrive un annuncio completo da un brief (`brief`, `templateId` facoltativo): RAL, processo dichiarato, titolo per entrambi i sessi; pubblica solo dopo il tuo via esplicito |
| `answer_inbox` | passa le candidature in attesa di risposta (`state` facoltativo) e prepara le risposte; le invii tu dall'app |
| `find_candidates` | propone criteri oggettivi da un annuncio (`jobId`), aspetta la tua conferma, poi elenca chi li soddisfa nell'ordine di arrivo, più i CV che una persona deve controllare |
| `weekly_report` | i numeri degli ultimi sette giorni (`jobId` facoltativo), ogni tasso con il suo denominatore, senza nomi |
| `interview_kit` | domande per ogni fase dichiarata di un annuncio (`jobId`) e una griglia di osservazione senza punteggi né voti |
