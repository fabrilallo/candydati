# Cerca nel database

La maggior parte degli ATS dimentica chi si è candidato l'anno scorso. In Candydati parti da lì: prima di pubblicare di
nuovo o di pagare un database, guarda i candidati che hai già. La ricerca è un filtro sui fatti che scegli tu. Non mette
in classifica nessuno e non decide al posto tuo.

## Chi viene cercato

I candidati della tua organizzazione, importati o che si sono candidati, il cui consenso copre le **posizioni future**
(il talent pool). Chi ha acconsentito a una sola selezione non compare mai. Nessuno fuori dal tuo database viene
cercato.

## Come funziona

In un annuncio, apri la scheda **Cerca nel database**, oppure premi **Trova persone** nella pagina dei candidati
dell'annuncio.

1. **Criteri.** Le competenze arrivano già compilate dalle tecnologie dell'annuncio. Aggiungile o cambiale, e aggiungi
   lingue, anni minimi di esperienza, una città o parole che devono comparire nel CV. Ogni criterio deve essere
   soddisfatto.
2. **Risultati.** I candidati il cui CV soddisfa tutti i criteri, dalla candidatura più recente, 25 per pagina. Per ogni
   competenza vedi come l'ha scritta il CV ("Go" scritto "Golang"). Mai un punteggio, mai una classifica.
3. **CV che nessuno ha potuto controllare.** I CV che non si sono potuti leggere, o non ancora strutturati, vengono
   contati e segnalati, non scartati, così una persona può guardarli.
4. **Decidi tu.** I nomi sono in chiaro e ogni risultato porta al profilo del candidato, dove decidi tu cosa fare. La
   ricerca da sola non aggiunge e non invia niente.

## Con l'assistente o un agente esterno

Chiedi all'assistente qualcosa come *"Chi nel nostro database va bene per questo annuncio?"*. Propone i criteri
dall'annuncio, aspetta la tua conferma e usa `find_candidates_by_criteria`, che guarda anche i candidati dell'annuncio.
Gli agenti esterni via MCP hanno lo stesso strumento ([API e MCP](./api)). I modelli vedono i candidati solo per nome e
id ([Assistente AI](./ai)).

## Regole

- **Fatti, non punteggi.** Un filtro su criteri confermati da una persona; nessun ordine di merito
  ([nessuna decisione automatica](./ai)).
- **Nessuna caratteristica protetta.** I criteri su età, sesso, origine, religione, famiglia, disabilità o aspetto
  vengono rifiutati. Non esiste un massimo di esperienza: funzionerebbe come un limite di età.
- **Tracciato.** Ogni ricerca registra chi l'ha fatta, per quale annuncio, i criteri e il numero di risultati, mai chi è
  stato trovato.
- **Permessi.** Chi può leggere i candidati (`candidate:read`) può cercare.

Le persone fuori dal tuo database (GitHub, il web) non vengono cercate. Potrebbe arrivare in una futura versione
ospitata.
