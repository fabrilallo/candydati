# Link tracciati e provenienza

Ogni canale in cui condividi un annuncio può avere il suo link. I Report mostrano poi, per canale e campagna, quante
persone hanno aperto l'annuncio, quante si sono candidate e quante sono state assunte.

## Creare un link

Apri un annuncio pubblicato, poi la scheda **Distribuzione**, poi **Link tracciati**.

1. Scegli un canale: LinkedIn, Indeed, InfoJobs, Glassdoor, Facebook, Instagram, X, Newsletter, Segnalazione, Fiera del
   lavoro, Università, oppure **Altro canale** e scrivine il nome.
2. Se vuoi, scrivi una campagna, per esempio `autunno-2026`. Usa lo stesso nome su ogni canale della campagna.
3. Premi **Salva link**. Compare in **Link salvati**, dove lo ritrovi ogni volta che torni nella scheda. Salvane quanti
   ne servono, uno per canale e campagna: salvare una coppia che hai già tiene quella che hai.
4. Copia il link. È l'indirizzo pubblico dell'annuncio con due parametri in più:

```text
https://jobs.example.com/careers/acme/backend-developer?utm_source=linkedin&utm_campaign=autunno-2026
```

Ogni link salvato mostra quante candidature sono arrivate da lì negli ultimi 90 giorni. Si salvano solo il canale e la
campagna, mai l'indirizzo: se l'indirizzo dell'annuncio cambia, i link salvati lo seguono. Rimuovere un link non cambia
nessun numero, le candidature arrivate da lì mantengono la loro provenienza. Salvare e rimuovere link richiede lo stesso
permesso che serve per pubblicare l'annuncio, ed entrambe le azioni finiscono nel registro delle azioni.

I nomi diventano minuscoli e ammettono solo lettere, numeri, punti, trattini e trattini bassi (al massimo 60 caratteri).
La pagina mostra come il tuo testo comparirà nei Report. Un indirizzo email non viene mai accettato come nome.

Puoi anche aggiungere a mano `?utm_source=...` e `&utm_campaign=...`, oppure solo `?ref=...`. Un link senza parametri
viene attribuito al sito di provenienza del visitatore (per esempio `google.com`) e a **diretta** quando non ce n'è.

## Cosa mostrano i Report

Nei **Report**, la scheda **Provenienza** elenca ogni canale con le visite all'annuncio, le candidature, la conversione
(candidature su visite) e le assunzioni con il loro tasso. Sotto, **Campagne** mostra le stesse cifre per canale e
campagna. La scheda Distribuzione di ogni annuncio mostra le stesse cifre solo per quell'annuncio, negli ultimi 90
giorni. L'esportazione CSV ha un blocco `sources` e uno `campaigns` con visite e conversione.

- La conversione si mostra da 5 visite in su; sotto vedi un trattino, come ogni percentuale nei Report.
- Una visita si conta quando un browser mostra la pagina dell'annuncio. Non si contano motori di ricerca e altri crawler,
  anteprime dei link e browser senza interfaccia, né chi ha un browser che invia Do Not Track o Global Privacy Control.
- Un client può contare al massimo 30 visite al minuto, così un ciclo di ricariche non gonfia i numeri.
- Le candidature arrivate da un link più vecchio, o da un browser che blocca gli script, non hanno una visita
  corrispondente: per un canale piccolo la conversione può superare il 100%.
- Un annuncio non pubblicato (bozza o chiuso) non conta visite.

## Cosa si conserva, e cosa no

Le visite sono **contatori**: un numero per annuncio, giorno, provenienza e campagna. Nient'altro.

- Nessun cookie e nessun archivio del browser (`localStorage`, `sessionStorage`).
- Nessun indirizzo IP e nessun user agent conservati. Lo user agent si legge solo per escludere i crawler, l'IP solo per
  limitare la frequenza.
- Due visite non si possono distinguere: i contatori non sono dati personali e non richiedono un banner.
- I contatori più vecchi di 25 mesi si cancellano ogni notte.

La candidatura conserva solo le etichette brevi di provenienza e campagna, mai un indirizzo web completo.

::: tip Crawler e `robots.txt`
I link con parametri `utm_` non vengono scansionati dai motori di ricerca (vedi `robots.txt`) e la rotta di conteggio
sta sotto `/api/`, anch'essa esclusa.
:::
