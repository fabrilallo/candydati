# Selezioni per conto di clienti

Agenzie per il lavoro e di ricerca e selezione, head hunter e consulenti possono gestire tutte le ricerche di tutti i
clienti in una sola organizzazione: un solo team, un solo database candidati, gli stessi modelli e un cliente su ogni
posizione. La licenza lo consente per qualsiasi numero di clienti
([LICENSE](https://github.com/fabrilallo/candydati/blob/main/LICENSE), Additional Use Grant): il cliente paga il lavoro
di selezione, non l'accesso al software.

Esempio: l'agenzia "Selezioni Rossi" cerca uno sviluppatore backend per Acme e un contabile per Beta. Le due posizioni
stanno nella stessa organizzazione; chi si è candidato all'una o all'altra è nello stesso database.

## Attivazione

Un owner o un admin apre **Impostazioni / Clienti** e attiva **Selezioniamo per conto di clienti**. Finché è spento i
clienti non compaiono da nessuna parte, e chi assume per sé non li vede mai.

Compila anche gli **estremi dell'autorizzazione**, per esempio il numero di protocollo dell'autorizzazione ministeriale:
il D.Lgs. 276/2003 (art. 9) vuole che gli annunci di selezione per conto terzi indichino l'agenzia e la sua
autorizzazione e vieta gli annunci anonimi. Gli estremi compaiono su ogni annuncio di una posizione per un cliente.

## Clienti

Un cliente ha un nome, un sito e un logo facoltativi (indirizzo https) e i referenti che ricevono le shortlist: nome ed
email. Recruiter, admin e owner creano e modificano i clienti; tutta l'organizzazione li vede. Un cliente con cui non
lavori più si archivia: posizioni e storico restano, nuove posizioni no.

## Una posizione per un cliente

Sulla posizione scegli il cliente e come l'annuncio lo mostra:

- **Mostra il nome del cliente**: l'annuncio dice "per Acme", il cliente è il datore di lavoro nei dati strutturati che
  leggono motori di ricerca e portali, e il suo sito è collegato.
- **Cliente riservato**: l'annuncio dice che la ricerca è per un cliente dell'agenzia che ha chiesto riservatezza. Nome,
  sito e logo del cliente non compaiono in nessun luogo pubblico: né nella pagina, né nel feed, né nei dati strutturati.

In entrambi i casi la pagina è della tua organizzazione, quindi l'agenzia è sempre indicata. Non esiste una terza
possibilità: un annuncio non presenta mai un'altra azienda come datore di lavoro.

Le posizioni e i **Report** si filtrano per cliente: tempi di assunzione, funnel e provenienza delle sole ricerche di un
cliente.

## Shortlist per il cliente

Da una posizione per un cliente apri **Shortlist** e premi **Nuova shortlist**:

1. Scegli il referente del cliente che la riceve.
2. Seleziona i candidati da presentare: solo chi si è candidato a questa posizione ed è ancora in attesa di esito.
3. Per ognuno scegli cosa condividere: il curriculum o no, e fino a cinque note (note su questa candidatura o sulla
   persona, mai su altre candidature). Email, telefono, tag e altre candidature non vengono mai condivisi.
4. Aggiungi un messaggio se vuoi, controlla il riepilogo e invia.

Il referente riceve per email un link personale, valido 14 giorni, con promemoria dopo 3 e 7 giorni finché qualcuno resta
senza risposta (ogni promemoria porta un link nuovo e il precedente smette di funzionare). Non serve un account. Per ogni
candidato il cliente risponde **Incontriamolo al colloquio** o **Non fa per noi**, con un breve motivo, una volta sola.

Le risposte compaiono sulla shortlist e nella cronologia di ogni candidato. Non spostano né decidono nulla: lo fa una
persona dell'agenzia, come per i feedback dei colloqui. Puoi revocare un link in qualsiasi momento; le risposte già date
restano.

## Cosa sa il candidato

Quando invii una shortlist, ogni candidato presentato riceve un'email che dice che il suo profilo è stato presentato al
cliente, con il nome, o a "un'azienda cliente dell'agenzia" se la posizione è riservata, e cosa è stato condiviso (nome,
curriculum, note). Per un cliente riservato l'email dice che può rispondere per sapere di quale azienda si tratta: il GDPR
gli riconosce il diritto di sapere chi ha ricevuto i suoi dati. L'email passa dalla sua conversazione, quindi compare tra
i messaggi e la risposta arriva a te.

Aggiorna l'informativa privacy prima di iniziare: con l'impostazione attiva, il modello in **Impostazioni / Privacy**
copre la presentazione dei profili ai clienti. Il cliente riceve i dati come titolare autonomo, solo per quella ricerca:
mettilo per iscritto con ogni cliente.

## Sicurezza del link

Il link è l'unica chiave. Se ne conserva solo l'hash, scade, si revoca con un clic, la sua pagina non viene mai messa in
cache né indicizzata, non invia il referrer, ha un limite di richieste e il curriculum si apre in una sandbox. La pagina
mostra solo ciò che il recruiter ha scelto, e nessun identificativo di altre persone.

## API e agenti

L'API elenca i clienti e il cliente di ogni posizione, e filtra posizioni e report per cliente. Via MCP `list_clients` e
il filtro per cliente di `list_jobs` e `get_reports` sono in sola lettura. Gestire i clienti e inviare shortlist sono
azioni di una persona: nessuna chiave API e nessun assistente può farle.
