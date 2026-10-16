# Migrare da un altro ATS

Porta qui lo storico di selezione da un altro ATS: annunci e fasi, candidati, candidature con esiti e date, note, email
e CV. Prima che venga scritto qualcosa vedi sempre un'anteprima, e puoi annullare l'intera migrazione.

::: warning La responsabilità resta tua
La tua azienda è il **titolare del trattamento**. Decide cosa spostare e ha la base giuridica per farlo. Candydati
sposta ciò che il pacchetto contiene e non verifica la base giuridica dei dati di origine.

Se a preparare il pacchetto è un agente AI o uno strumento di terzi, lo sceglie la tua azienda: il fornitore del modello
di quell'agente, o quello strumento, è un **tuo** responsabile del trattamento, coperto dai **tuoi** accordi, non da
quelli di Candydati.

Prima che la migrazione parta spunti tre dichiarazioni, registrate nel registro delle azioni con il tuo nome e l'ora.
:::

Possono migrare solo owner e admin. Il permesso non è disponibile per le chiavi API né per l'assistente.

## Cosa passa e cosa no

**Passa**

- Annunci, con stato (bozza, aperto, chiuso), date e fasi del processo.
- Candidati: nome, email, telefono, indirizzo LinkedIn, etichette, data di creazione.
- Candidature: fase attuale, esito (assunto, non selezionato, ritirato) e la sua data, provenienza, lettera di
  presentazione, risposte alle domande della candidatura, storico dei cambi di fase.
- CV e altri allegati.
- Note, con autore e data originale, comprese le note libere dei colloqui.
- Email passate, come storico: non vengono mai inviate di nuovo.

**Non passa, di proposito**

- Punteggi, voti, valutazioni delle schede, valutazioni automatiche dell'AI, percentuali di "match" e classifiche.
  Candydati non dà voti alle persone (vedi [Introduzione](./introduction)), quindi il formato non ha un campo per
  questi dati. Le note libere dei colloqui arrivano invece come note.
- Dati demografici o di categorie particolari, foto e date di nascita: il prodotto raccoglie solo ciò che serve alla
  selezione.
- Account e credenziali. Gli autori delle note diventano membri solo se la loro email coincide con quella di un membro
  esistente; altrimenti la nota conserva il loro nome.

Il formato rifiuta i campi sconosciuti invece di ignorarli, quindi nessuno di questi dati può entrare sotto un altro nome.

### Consenso e conservazione

Il titolare resta lo stesso, quindi il consenso si porta dietro:

- Un candidato con una **data di consenso** nell'origine la mantiene: viene registrato come dato alla data originale, e
  la conservazione segue la scadenza dell'origine o il periodo di conservazione della tua organizzazione.
- Un candidato **senza alcuna data** passa dal flusso di riconferma degli import: se ha un'email gli viene chiesto di
  confermare, e se non lo fa i dati vengono cancellati.
- Un candidato la cui conservazione è **già scaduta** viene lasciato fuori, con tutto ciò che lo riguarda: una
  migrazione non riporta dati che andavano cancellati.

Se una persona è già tra i tuoi candidati (riconosciuta dall'email), il suo profilo non viene mai sovrascritto: lo
storico vi si aggiunge.

## I passaggi

Apri **Migrazione** nella navigazione, poi **Nuova migrazione**.

1. **Fonte.** Scegli come arriva il pacchetto. Oggi significa "Carica un pacchetto di migrazione".
2. **Pacchetto.** Carica lo ZIP. Ai tuoi candidati non arriva ancora nulla.
3. **Analisi.** Il pacchetto viene aperto e ogni riferimento viene controllato. Puoi chiudere la pagina: la migrazione
   resta nell'elenco. Se il pacchetto non si può leggere, non è stato scritto nulla e ti viene mostrato il motivo.
4. **Anteprima.** I numeri (annunci, persone, candidature, note, email, file), gli annunci, il riepilogo dei consensi e
   le segnalazioni, divise in errori, cose da controllare e informazioni. Gli errori bloccano la migrazione finché non
   sono risolti (per esempio, la tua organizzazione non ha un'informativa privacy pubblicata).
5. **Annunci e fasi.** Scegli dove finisce ogni fase del vecchio processo nelle tue pipeline, per nome per tutti gli
   annunci o annuncio per annuncio, e lascia fuori gli annunci che non vuoi. *Ricevute* è la prima colonna: le
   candidature arrivano lì.
6. **Responsabilità.** Leggi il riquadro qui sopra e spunta le tre dichiarazioni: la tua organizzazione è titolare del
   trattamento; hai controllato l'anteprima e sai che date di consenso e conservazione sono prese dall'origine così
   come sono; l'eventuale agente AI o strumento che ha preparato il pacchetto è coperto dai tuoi accordi. Poi conferma.
7. **Risultato.** La migrazione viene scritta a blocchi. Vedi cosa è stato creato, unito e lasciato fuori, e le
   richieste di consenso inviate.

## Anteprima e annullamento

Nulla viene scritto prima del passaggio 6, e l'anteprima mostra cosa succederà. Dopo la migrazione, **Annulla
migrazione** cancella in modo definitivo:

- le persone create dalla migrazione, con CV, note, email e candidature;
- per le persone che esistevano già, solo ciò che la migrazione ha aggiunto (candidature, note, email e storico);
- gli annunci creati dalla migrazione, quando nient'altro vi fa riferimento.

Restano le persone che hanno confermato il consenso o si sono candidate di nuovo dopo la migrazione (da quel momento i
dati sono loro) e gli annunci pubblicati o con altre candidature. La traccia della migrazione resta nell'elenco con i
suoi numeri. L'annullamento non si può revocare.

## Il formato del pacchetto

Un pacchetto di migrazione è uno ZIP con un file `migration.json` alla radice e i CV e gli allegati sotto `files/`. Il
formato è pubblico e versionato:
[`migration-package.v1.json`](https://github.com/fabrilallo/candydati/blob/main/docs/schema/migration-package.v1.json)
(vedi anche le
[note sugli schemi](https://github.com/fabrilallo/candydati/blob/main/docs/schema/README.md)).

- `source` dice da quale sistema arriva, quando è stato esportato e chi ha costruito il pacchetto.
- `jobs` con le loro `stages`, `candidates` con un `consent` facoltativo, `applications`, `notes`, `messages` e `users`.
- Ogni record ha un `ref` stabile scelto da chi costruisce il pacchetto; le date sono ISO 8601 con fuso orario.
- Un pacchetto contiene al massimo 10.000 file e 1 GiB, 50.000 candidati, 100.000 candidature, 200.000 note e 200.000
  email. Un archivio più grande si migra in più pacchetti, per esempio uno per anno: i candidati si uniscono per email.

Un connettore, la skill per agenti e un pacchetto scritto a mano passano tutti dalla stessa validazione.

## La skill per agenti

Il repository include una skill che insegna a un agente AI (Claude Code e altri agenti che sanno leggere istruzioni ed
eseguire `node`) a leggere il tuo vecchio ATS e a costruire il pacchetto per te. Si trova in
[`skills/candydati-migration`](https://github.com/fabrilallo/candydati/tree/main/skills/candydati-migration), con le
istruzioni di installazione nel suo README.

- L'agente comincia dicendoti che la responsabilità è della tua azienda, e si ferma se non confermi.
- Non include mai punteggi, voti, valutazioni, dati demografici, foto o date di nascita, e non inventa mai un valore.
- Controlla il pacchetto offline con un validatore (`scripts/validate.mjs`, Node 24 o successivo, nessuna rete) prima di
  darti lo ZIP.
- Non carica mai il pacchetto e non conferma mai la migrazione: lo fai tu, nell'app.

Ricorda che i dati dei candidati passano dal fornitore del modello dell'agente: deve essere coperto dai tuoi accordi.

## Connettori

I connettori integrati, in cui inserisci una chiave di sola lettura e il pacchetto viene costruito per te, sono **in
arrivo**. Quello disponibile oggi, Zucchetti InRecruiting, non ha un'API pubblica: legge un file di export che carichi
(vedi [InRecruiting](#inrecruiting)).

| Origine | Stato |
| --- | --- |
| Teamtailor | in arrivo |
| Workable | in arrivo |
| Greenhouse | in arrivo |
| Recruitee | in arrivo |
| Zucchetti InRecruiting | beta (file di export) |

Quando arriveranno saranno segnati come **beta**: costruiti sulla documentazione pubblica dell'origine e non ancora
verificati su un account reale, quindi controlla con attenzione l'anteprima. Un connettore diventa stabile solo dopo una
migrazione reale, registrata nell'
[elenco delle fonti](https://github.com/fabrilallo/candydati/blob/main/docs/migration/sources.md) (in inglese). La
chiave API resta cifrata solo mentre i dati vengono letti, poi viene cancellata. Nel frattempo usa la skill o un
pacchetto che costruisci tu.

### InRecruiting

Zucchetti InRecruiting **non ha un'API pubblica**, quindi questo connettore non chiede una chiave: legge l'**export** che
ottieni dal fornitore. È **beta**: i nomi delle colonne qui sotto sono ipotizzati (nessun formato di export reale è
pubblico) e il connettore non è stato verificato su un account reale, quindi controlla con attenzione l'anteprima.

1. **Chiedi un export completo.** Scrivi al supporto InRecruiting / Zucchetti e chiedi un export delle candidature in un
   foglio di calcolo (CSV o Excel), una riga per candidatura, e, se vuoi i CV, uno ZIP con i file dei CV. Può essere un
   servizio a pagamento nel tuo piano: è un accordo tra te e il fornitore.
2. **Controlla le colonne.** Candydati riconosce queste intestazioni (italiano o inglese, maiuscole e accenti non contano):

   | Informazione | Intestazioni riconosciute |
   | --- | --- |
   | Nome (obbligatorio) | Nome e cognome, Nominativo, Full name, oppure Nome e Cognome / First name e Last name |
   | Annuncio (obbligatorio) | Annuncio, Posizione, Ruolo, Job, Job title, Vacancy |
   | Codice annuncio | Codice annuncio, Codice posizione, Job code |
   | Email, telefono | Email, Telefono, Cellulare, Phone |
   | Fase | Stato, Fase, Stage, Status |
   | Data candidatura | Data candidatura, Application date, Applied at |
   | Esito | Esito, Esito finale, Outcome |
   | Note, tag, fonte | Note, Tag, Fonte, Source |
   | File del CV | CV, File, Allegato, Curriculum |

   Una colonna con un altro nome viene **lasciata fuori ed elencata** nell'anteprima. Se il tuo export usa altri nomi,
   **rinomina le colonne nel foglio prima di caricarlo**: ci vuole un minuto e non cambia altro.
3. **Carica.** Nel primo passo scegli *Zucchetti InRecruiting*, poi il foglio e, se vuoi, lo ZIP dei CV. I file servono
   solo a leggere i dati e vengono cancellati appena la lettura finisce, qualunque sia il risultato.

Come legge il file: una riga è una candidatura; gli annunci sono i titoli distinti (più il codice, se c'è); le fasi di un
annuncio sono i valori distinti della colonna fase, nell'ordine in cui compaiono; uno stato o un esito come *Assunto*,
*Scartato*, *Non idoneo*, *Ritirato* chiude la candidatura alla data della riga. Le persone si uniscono per email, o per
nome se manca l'email. Un CV si abbina con la colonna CV, altrimenti con l'email o il nome e cognome nel nome del file;
un CV che non si può abbinare con certezza non viene importato e l'anteprima dice quanti sono. Un annuncio con
candidature ancora aperte arriva come bozza: la migrazione non pubblica mai nulla.

**Punteggi e valutazioni non vengono mai importati.** Una colonna chiamata Valutazione, Punteggio, Rating, Voto, Stelle e
simili viene ignorata di proposito ed elencata nell'anteprima. Il foglio può avere fino a 5000 righe: dividine uno più
grande.

Se la lettura fallisce con "il foglio non ha una colonna per il nome o per l'annuncio", rinomina le colonne come sopra e
carica di nuovo.

## GDPR e il tuo ruolo

- La tua organizzazione è il titolare del trattamento, prima e dopo la migrazione. Verifica di avere una base giuridica
  per spostare i dati e che la tua informativa privacy li copra. Per avviare una migrazione serve un'informativa privacy
  pubblicata.
- Date di consenso e periodi di conservazione passano così come sono: ne rispondi tu.
- Un agente AI o uno strumento di terzi che prepara il pacchetto è un tuo responsabile del trattamento. Candydati non è
  il suo responsabile.
- I dati che non volevi conservare (punteggi, categorie particolari) non entrano mai, e i dati scaduti restano fuori.
- Tutto è registrato nel registro delle azioni, comprese le tue tre dichiarazioni; cancellazione e diritti
  dell'interessato valgono per le persone migrate come per ogni altro candidato. Vedi
  [Sicurezza e privacy](./security).
