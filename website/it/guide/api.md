# API, webhook e MCP

Tutto quello che si fa nell'interfaccia si può fare tramite l'API e tramite MCP. Le tre superfici chiamano gli stessi
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
| `add_candidate_note` | aggiunge una nota interna a un candidato |
| `create_task` | crea un'attività su un candidato o un annuncio |
| `list_job_templates` | elenca i template degli annunci |
| `get_job_stats` | numeri degli annunci per la panoramica |
| `get_reports` | numeri aggregati del periodo, senza dati personali |

Non ci sono strumenti per spostare, valutare, scartare o scrivere ai candidati: restano decisioni di una persona. Ogni
chiamata a uno strumento conta nel limite della chiave, un batch contiene al massimo 20 messaggi e le letture vengono
registrate. Gli strumenti che usano il modello (`analyze_job_ad`, e `publish_job` quando `FAST_MODEL` è impostato)
hanno budget giornalieri, vedi [Assistente AI](./ai).
