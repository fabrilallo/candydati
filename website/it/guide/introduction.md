# Introduzione

Candydati è un sistema di gestione delle candidature (ATS) che installi sul tuo server. È pensato per piccole e medie
aziende, per i loro recruiter e per chi si occupa di risorse umane senza essere un tecnico, e per i candidati che si
candidano dalle pagine carriere pubbliche. Tutto quello che si fa nell'interfaccia si può fare anche con un agente,
tramite l'API.

Il codice è pubblico. Le regole che applica sono codice che chiunque può leggere, verificare e migliorare, e le buone
pratiche sono parte del prodotto invece di essere lasciate alla buona volontà.

## Principi

Non sono impostazioni. Un'installazione non può disattivarli.

- **RAL in chiaro.** Un annuncio senza fascia retributiva non si può pubblicare. La fascia compare nell'annuncio, nei
  dati strutturati e in ogni feed.
- **Processo di selezione dichiarato.** Le fasi, chi le conduce, quanto durano e in quanto tempo i candidati ricevono
  risposta sono visibili prima di candidarsi. Le fasi dichiarate nell'annuncio diventano le fasi della pipeline.
- **Ogni candidatura riceve una risposta.** Ogni candidatura porta con sé una promessa di risposta ("risposta entro N
  giorni") con il conto alla rovescia. Un annuncio con candidature ancora aperte non si può chiudere: prima una persona
  decide su ciascuna.
- **Nessuna decisione automatica sui candidati.** Il prodotto non ordina, non assegna punteggi, non classifica e non
  scarta persone. I punteggi di qualità valutano l'annuncio, mai i candidati.
- **Pronto per gli agenti.** L'API REST e il server MCP chiamano gli stessi servizi dell'interfaccia, con gli stessi
  permessi e lo stesso registro delle azioni.
- **GDPR by design.** Consenso, conservazione e cancellazione esistono dal primo candidato salvato.
- **Nessun vincolo.** Un export completo, in un formato aperto e documentato, è disponibile in qualsiasi momento.

La definizione completa del prodotto è in
[PRODUCT.md](https://github.com/fabrilallo/candydati/blob/main/docs/PRODUCT.md) (in inglese).

## Cosa trovi

- Annunci strutturati con uno standard di pubblicazione (retribuzione, processo, contratto, modalità di lavoro) e
  controlli di conformità italiani.
- Una pagina carriere con editor di pagina, dati strutturati (`JobPosting`), un feed XML e un'API pubblica degli
  annunci in sola lettura.
- Candidature senza registrazione, con consenso versionato.
- Una pipeline le cui fasi sono quelle dichiarate nell'annuncio, la ricerca nel database candidati, il CV originale
  accanto ai dati estratti.
- Organizzazioni, ruoli e gruppi di selezione per annuncio; feedback dei colloqui tramite link personali, senza account.
- Modelli di email, invii singoli e massivi, risposte in arrivo collegate al candidato.
- Report: tempo di assunzione, conversione per fase, fonti, tempi di risposta.
- Conservazione, cancellazione automatica, diritti dell'interessato, registro delle azioni non modificabile, import con
  anteprima e annullamento.
- API REST con OpenAPI, chiavi API, webhook firmati, server MCP e un assistente di processo facoltativo.

L'interfaccia è in italiano e in inglese. Il progetto è pre-1.0: vedi il
[changelog](https://github.com/fabrilallo/candydati/blob/main/CHANGELOG.md).

## La licenza in parole semplici

Candydati è rilasciato con la [Business Source License 1.1](https://github.com/fabrilallo/candydati/blob/main/LICENSE).

- **Puoi** usarlo in produzione per le assunzioni della tua organizzazione e delle società collegate, gratis, con
  tutte le funzioni. Il fatto che candidati, intervistatori e altre persone esterne lo usino non cambia nulla.
- **Puoi** installarlo, ospitarlo, dare assistenza o consulenza a una singola organizzazione che lo usa per le proprie
  assunzioni.
- **Non puoi**, senza una licenza commerciale, offrirlo a terzi come servizio ospitato (un ATS, un software di
  selezione o un servizio di pagine carriere), né includerlo in un prodotto che vendi.
- Ogni versione diventa **AGPL-3.0** quattro anni dopo la sua prima pubblicazione.

Fa fede il testo della licenza: questo riassunto non lo sostituisce.

## Quanto costa farlo funzionare

| Voce | Costo tipico |
|---|---|
| Un server Linux (2 vCPU, 4 GB di RAM, 40 GB di disco) | circa 5–7 € al mese (es. Hetzner CX23 o CAX11, OVHcloud VPS-1, ottobre 2026) |
| Un dominio | probabilmente ce l'hai già: basta un sottodominio come `ats.example.com` |
| Invio delle email | i piani gratuiti dei servizi transazionali, oppure la casella aziendale che già paghi |
| AI (facoltativa) | a consumo presso il fornitore di modelli che scegli; spenta di default |

Tutto il resto (database, archivio dei file, certificati HTTPS, backup) gira sullo stesso server ed è incluso.

Prossimo passo: [Avvio rapido](./quick-start).
