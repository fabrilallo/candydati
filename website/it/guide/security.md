# Sicurezza e privacy

## Cosa impone il codice

Non devi ricordartele: un'installazione in produzione le applica da sola.

- **Segreti**: lo stack non parte con segreti di esempio, corti o poco casuali. L'installer li genera.
- **Trasporto**: l'indirizzo pubblico deve essere `https`, così i cookie di sessione sono sempre `Secure`. I
  certificati si rinnovano da soli.
- **Solo il web è esposto**: database, archivio, api e worker restano su una rete interna.
- **Account**: ogni account conferma l'email prima del primo accesso; la registrazione è solo su invito; gli accessi
  falliti rallentano i tentativi successivi invece di bloccare l'account, e il proprietario viene avvisato dopo 10
  fallimenti. L'autenticazione a due fattori (TOTP con codici di riserva) è disponibile per tutti, e proprietari e
  amministratori possono renderla obbligatoria.
- **Isolamento**: ogni query è limitata a una sola organizzazione; ogni azione è controllata rispetto ai permessi della
  persona e scritta in un registro delle azioni non modificabile.
- **Le chiavi API** scadono sempre e non hanno mai più permessi di chi le ha create.
- **I log** non contengono mai i segreti dei link (recupero password, inviti, link di feedback e di consenso) né gli
  header.
- **I webhook** non raggiungono mai indirizzi privati, di loopback o di metadati del cloud, e non seguono i redirect.
- **Caricamenti**: CV e import vengono controllati in base al contenuto, e gli archivi si decomprimono con un tetto
  rigido.

Elenco completo: [SECURITY.md, Secure defaults](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md#secure-defaults-for-self-hosted-instances)
(in inglese).

## Cosa resta a te

- Tieni aggiornato il server e il firewall chiuso tranne 80, 443 e SSH.
- Conserva `/opt/candydati/.env` in un gestore di password, e una copia dei backup fuori dal server.
- Togli `BOOTSTRAP_TOKEN` quando il primo proprietario si è registrato.
- Aggiorna Candydati quando una release corregge un problema di sicurezza (`candydati update`).

La checklist per chi gestisce l'installazione è in
[OPERATIONS.md](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#security-checklist-for-operators)
(in inglese).

## Segnalare una vulnerabilità

Non aprire una issue pubblica. Usa il canale privato di GitHub: la scheda **Security** del repository, poi **Report a
vulnerability**. Dettagli e tempi di risposta: [SECURITY.md](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md).

## Privacy e GDPR

In self-hosting **la tua azienda è titolare del trattamento**, e per la piattaforma non c'è un responsabile esterno: la
gestisci tu. I fornitori che scegli (hosting del server, email, modello di AI) trattano dati per tuo conto e vanno
nominati responsabili o sub-responsabili.

Cosa fa il prodotto per te:

| Requisito | Nel prodotto |
|---|---|
| Informativa e consenso | testo versionato per organizzazione; ogni candidatura salva versione, data e ambito accettato |
| Ambiti di consenso separati | la singola selezione oppure, con un consenso distinto e facoltativo, anche il database candidati per posizioni future |
| Conservazione | una durata per ambito, con una scadenza calcolata su ogni candidato |
| Cancellazione automatica | un job giornaliero avvisa prima della scadenza, poi anonimizza o cancella, file compresi |
| Diritti dell'interessato | export, correzione, cancellazione e ritiro del consenso dalla scheda del candidato |
| Registro delle azioni | chi ha visto, modificato, esportato o cancellato cosa; non modificabile |
| Minimizzazione | nessun campo per dati particolari; l'estrazione dai CV scarta foto, data di nascita e stato civile |
| Nessuna decisione automatizzata (art. 22) | nulla ordina, assegna punteggi o scarta i candidati; l'assistente scrive a un candidato solo dopo la conferma di una persona |
| Export | un archivio ZIP per candidato e l'export dell'intera organizzazione |

Nell'app, **Impostazioni, Privacy** mostra il registro dei trattamenti compilato con i dati della tua organizzazione
(nome, contatto, conservazione, fornitori configurati).

I modelli in italiano dell'informativa ai candidati, del registro dei trattamenti, dell'accordo sul trattamento dei
dati e dell'elenco dei sub-responsabili sono in
[docs/legal](https://github.com/fabrilallo/candydati/blob/main/docs/legal/README.md). Sono punti di partenza e vanno
fatti rivedere da un legale. Cosa resta a te: verificare quei documenti, valutare se servono una DPIA o un DPO,
scegliere e motivare le durate di conservazione, istruire le persone che usano la piattaforma e rispondere alle
richieste degli interessati entro un mese.
