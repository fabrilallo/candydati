# Schema pubblici

- `job-content.v1.json`: schema JSON (draft 2020-12) del contenuto di un annuncio di lavoro, versione 1 (PLAN §5.3).
  Descrive solo la forma dei dati; è lo stesso schema Zod usato da API, feed, import ed export.
- `candidate-export.v1.json`: schema JSON del file `candidate.json` dell'export di un candidato e dell'export dell'organizzazione (PLAN §7): anagrafica, candidature con consensi, messaggi, estrazione dal CV e note. Le date sono stringhe ISO 8601; i CV originali sono nello ZIP accanto al file e vi si fa riferimento con `applications[].cv.path`. Si rigenera con lo stesso comando.
- Le regole di pubblicazione del §5.1 (ruolo, RAL, modalità di lavoro, fasi, responsabilità, requisiti) non sono nel file:
  le applica `checkPublishable` di `@tt/domain` sopra la forma.
- Per rigenerarlo dopo una modifica allo schema: `pnpm --filter @tt/domain schema` (compila e scrive questo file).
- Una modifica incompatibile richiede una nuova versione (`job-content.v2.json`), senza riscrivere la v1.
- Le fasi del processo (`process[]`) hanno due campi opzionali, aggiunti senza cambiare versione perché compatibili con i dati esistenti:
  `id` (stringa stabile, `^[a-z0-9-]{1,40}$`; il server la assegna alle fasi che ne sono prive e la restituisce sempre) e `title`
  (titolo libero di 1-80 caratteri; se manca si mostra il tipo). I candidati sono legati all'`id`, non alla posizione.
