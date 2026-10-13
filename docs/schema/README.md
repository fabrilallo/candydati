# Schema pubblici

- `job-content.v1.json`: schema JSON (draft 2020-12) del contenuto di un annuncio di lavoro, versione 1 (PLAN §5.3).
  Descrive solo la forma dei dati; è lo stesso schema Zod usato da API, feed, import ed export.
- Le regole di pubblicazione del §5.1 (ruolo, RAL, modalità di lavoro, fasi, responsabilità, requisiti) non sono nel file:
  le applica `checkPublishable` di `@tt/domain` sopra la forma.
- Per rigenerarlo dopo una modifica allo schema: `pnpm --filter @tt/domain schema` (compila e scrive questo file).
- Una modifica incompatibile richiede una nuova versione (`job-content.v2.json`), senza riscrivere la v1.
