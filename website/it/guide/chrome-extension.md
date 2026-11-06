# Estensione Chrome (LinkedIn)

L'estensione Candydati permette all'assistente di leggere LinkedIn **nel tuo browser, con il tuo account**, quando gli
chiedi di trovare persone per una posizione ("trovami backend engineer a Stoccolma come Maja"). Candydati non entra mai
in LinkedIn e non conserva credenziali LinkedIn: l'estensione apre le pagine in una scheda del tuo Chrome, legge quello
che mostrano e lo passa al tuo Candydati.

## Prima di usarla

- **Le condizioni d'uso di LinkedIn vietano la lettura automatica dei profili.** LinkedIn può chiedere verifiche,
  limitare o bloccare l'account usato. Il rischio riguarda quell'account: la prima volta Candydati ti chiede di
  accettarlo e lo registra.
- Un titolare o amministratore attiva il sourcing su LinkedIn per l'organizzazione (Privacy → Conservazione) e sceglie
  il massimo di profili per ricerca. Per ogni ricerca scegli tu quanti, entro quel limite.
- Se LinkedIn mostra un controllo (CAPTCHA, verifica), l'estensione si ferma e lascia la scheda davanti a te. Non prova
  mai ad aggirarlo.

## Come funziona una ricerca

1. Chiedi all'assistente; lui propone criteri oggettivi e aspetta che li confermi.
2. Si apre una scheda in un gruppo chiamato **Candydati** nel tuo Chrome: la ricerca persone di LinkedIn, poi ogni
   profilo, uno alla volta. Chiudi la scheda per fermarla.
3. Alla fine la scheda si chiude. Il tuo Candydati ricava, per ogni persona, cosa dice il profilo su ogni criterio
   (nessun punteggio, nessuna classifica) e se è già un contatto o un candidato.
4. Scegli tu chi aggiungere. Diventano contatti della posizione: ricevono l'informativa con il tuo primo messaggio e
   vengono cancellati dopo 30 giorni se non si candidano.

## Salvare un profilo mentre navighi

Su ogni profilo LinkedIn che visiti tu, in basso a destra c'è un piccolo pulsante **Salva in Candydati**.

1. Cliccalo: Candydati si apre in una nuova scheda con nome, titolo e città della persona e il link al profilo.
2. Scegli la posizione aperta, aggiungi se vuoi cosa del profilo riguarda la posizione (una riga "criterio: fatto"), e
   clicca **Aggiungi come contatto**.
3. Candydati ti dice se la persona è stata aggiunta, se è già un contatto o un candidato, o se ha chiesto di non essere
   ricontattata.

Prima apri Candydati una volta nello stesso Chrome: è così che l'estensione impara l'indirizzo del tuo Candydati. Il
pulsante funziona anche senza attivare il sourcing su LinkedIn per l'organizzazione: legge solo il profilo che stai
guardando, quando clicchi. Possono usarlo titolari, amministratori e recruiter (i ruoli che gestiscono i contatti
trovati).

## Privacy

Cosa fa l'estensione con i dati, per intero:

- **Cosa legge**: solo le pagine LinkedIn che apre per una ricerca avviata da te, nella scheda che ha aperto. Di ogni
  profilo: nome, titolo, località e il testo visibile della pagina (con un limite). Con il pulsante di salvataggio, solo
  il profilo che stai guardando e solo quando clicchi: nome, titolo, località e indirizzo (il testo della pagina non
  viene inviato). Mai foto, mai contatti nascosti dietro pulsanti, mai i tuoi messaggi o la tua rete, mai altre schede o
  altri siti.
- **Dove va**: solo all'istanza Candydati in cui sei entrato, dalla pagina che ha chiesto la ricerca o dalla pagina di
  salvataggio del tuo Candydati. Non a chi sviluppa Candydati, non a terzi, non a strumenti di analisi.
- **Cosa conserva**: nessuno storico. Tiene solo il profilo su cui hai cliccato "Salva", nella memoria di sessione del
  browser finché la pagina del tuo Candydati non lo prende (poi viene cancellato; dopo 10 minuti viene rifiutato e il
  clic successivo lo sostituisce), e l'indirizzo del tuo Candydati, perché il pulsante sappia dove aprirlo.
- **Permessi**: `tabGroups` (il gruppo visibile "Candydati"), `scripting` (leggere le pagine che ha aperto), `storage`
  (il profilo in attesa di essere salvato e l'indirizzo del tuo Candydati) e accesso al solo `www.linkedin.com`, dove
  mostra il pulsante di salvataggio. Accetta richieste solo dagli indirizzi Candydati per cui è stata costruita.
- **Uso limitato**: i dati servono solo a mostrarti le persone che hai cercato e ad aggiungere quelle che scegli. Non
  vengono mai venduti, mai usati per pubblicità, mai usati per addestrare modelli.

La tua organizzazione Candydati è titolare del trattamento delle persone che aggiungi; i loro diritti passano dal link
personale dell'informativa che ricevono.

## Istanze installate in proprio

L'estensione pubblicata risponde solo al Candydati ospitato. Un'istanza installata in proprio, con il suo dominio, se ne
costruisce una:

```bash
CANDYDATI_ORIGINS=https://jobs.example.com pnpm --filter @candydati/extension package
```

Poi carica lo zip in Chrome (Estensioni → Modalità sviluppatore → Carica estensione non pacchettizzata, da
`apps/extension/dist`) oppure pubblicala, e imposta `NUXT_PUBLIC_EXTENSION_ID` (e `NUXT_PUBLIC_EXTENSION_URL`) sull'app
web.
