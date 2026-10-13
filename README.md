# team-tracker

Nome in codice di un ATS open source e agentico, dalla parte del candidato: RAL in chiaro obbligatoria, processo di selezione dichiarato, nessuna candidatura senza esito.

Il nome del prodotto non è deciso e non va scritto nel codice.

- Piano: [`docs/PLAN.md`](docs/PLAN.md)
- Stato: Fase 0 (fondamenta) e Fase 1 (annuncio e standard) fatte: organizzazioni, ruoli, inviti, registro delle azioni; editor dell'annuncio con blocco della pubblicazione, punteggio di qualità, template, pagina carriere pubblica con JSON-LD; Fase 2 (candidatura e pipeline): form senza registrazione con consenso versionato e CV, estrazione del CV, pipeline a fasi, scheda candidato, note, ricerca; Fase 3 (comunicazione): email a nome dell'azienda, risposte agganciate alla candidatura, template, invio massivo, messaggi di esito. In locale le email finiscono in Mailpit (http://localhost:8025). Fase 4 (automazioni e scadenze): conto alla rovescia sulla risposta promessa, vista Da gestire, notifiche e riepiloghi, attività, automazioni per fase, webhook firmati, chiusura dell'annuncio vincolata agli esiti.
- Avvio in locale: `cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm dev` (web su :3000, api su :4000).
