# Estensione Chrome (LinkedIn, Google)

L'estensione Candydati permette all'assistente di leggere LinkedIn **nel tuo browser, con il tuo account**, quando gli
chiedi di trovare persone per una posizione ("trovami backend engineer a Stoccolma come Maja"). Candydati non entra mai
in LinkedIn e non conserva credenziali LinkedIn: l'estensione apre le pagine in una scheda del tuo Chrome, legge quello
che mostrano e lo passa al tuo Candydati.

La stessa estensione permette all'assistente anche di **cercare su Google nel tuo browser** (vedi
[Ricerca sul web](#ricerca-sul-web-google)): solo risultati pubblici, senza usare l'account LinkedIn.

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

## Ricerca sul web (Google)

Chiedi all'assistente di cercare sul web per una posizione ("cerca su Google sviluppatori Go a Torino"). Scrive lui la
ricerca, spesso una ricerca "X-ray" come `site:linkedin.com/in "Go" Torino` o `site:github.com Rust Milano`, e
l'estensione la esegue su `www.google.com` nella stessa scheda visibile **Candydati**.

- Legge **solo le pagine dei risultati**: titolo, link e anteprima di ogni risultato organico. Annunci, "Altre domande"
  e i riquadri di Google restano fuori; le pagine dietro i risultati non vengono mai aperte.
- Il tuo Candydati tiene i risultati che portano a una persona (un profilo LinkedIn o GitHub, una pagina intitolata con
  un nome), mostra nome, città quando Google la riporta e l'anteprima come fatto, nell'ordine di Google (mai una
  classifica), e segnala chi è già un contatto o un candidato. Chi ha chiesto di non essere contattato resta fuori.
- Nessuna impostazione dell'organizzazione e nessun rischio da accettare: è una normale ricerca Google, nel tuo browser.
  Servono l'estensione e il permesso di fare sourcing.
- Se Google mostra il controllo sul "traffico insolito" o la pagina del consenso ai cookie, l'estensione si ferma e lascia
  la scheda davanti a te: rispondi tu, poi chiedi all'assistente di cercare di nuovo. Non prova mai ad aggirarli.

## Privacy

Cosa fa l'estensione con i dati, per intero:

- **Cosa legge**: solo le pagine LinkedIn e Google che apre per una ricerca avviata da te, nella scheda che ha aperto. Di
  ogni profilo LinkedIn: nome, titolo, località e il testo visibile della pagina (con un limite). Di una pagina di
  risultati Google: titolo, link e anteprima di ogni risultato organico. Mai foto, mai contatti nascosti dietro pulsanti,
  mai i tuoi messaggi, la tua rete o il tuo account Google, mai altre schede o altri siti.
- **Dove va**: solo all'istanza Candydati in cui sei entrato, dalla pagina che ha chiesto la ricerca. Non a chi sviluppa
  Candydati, non a terzi, non a strumenti di analisi.
- **Cosa conserva**: niente. Non ha permessi di archiviazione e non tiene storico: tutto finisce con la ricerca.
- **Permessi**: `tabGroups` (il gruppo visibile "Candydati"), `scripting` (leggere le pagine che ha aperto) e accesso ai
  soli `www.linkedin.com` e `www.google.com`. Accetta richieste solo dagli indirizzi Candydati per cui è stata costruita.
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
