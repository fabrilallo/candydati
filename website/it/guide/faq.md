# Domande frequenti

## Quanto costa?

Il software è gratuito per le tue assunzioni. Paghi il server (pochi euro al mese per 2 vCPU e 4 GB di RAM presso la
maggior parte dei provider cloud), l'invio delle email se il tuo fornitore lo fa pagare e, solo se lo attivi, il
modello di AI che scegli. Non ci sono costi per utente o per annuncio, né funzioni riservate.

## Servono Cloudflare o altri account?

No. Servono un server, un dominio e un account email per l'invio. Database, archivio dei file, certificati HTTPS e
backup girano sullo stesso server. Cloudflare Turnstile sul modulo di candidatura è un'opzione che puoi attivare, mai un
obbligo.

## Posso usarlo per i miei clienti?

Usarlo per le assunzioni della tua organizzazione e delle società collegate è consentito. Installarlo, ospitarlo, dare
assistenza o consulenza a **una singola organizzazione** che lo usa per le proprie assunzioni è consentito anche
questo. Offrirlo a terzi come servizio ospitato, o includerlo in un prodotto che vendi, richiede una licenza
commerciale. Vedi [Introduzione, la licenza in parole semplici](./introduction#la-licenza-in-parole-semplici).

## Dove stanno i dati?

Sul tuo server, nel paese in cui il tuo provider cloud lo colloca. Agli autori di Candydati non arriva nulla. I dati
escono dal server solo verso i fornitori che configuri: il fornitore email, il fornitore del modello di AI se attivo,
l'archivio dei backup esterno se lo imposti, un raccoglitore di errori se lo imposti.

## Posso mostrare il mio nome al posto di Candydati?

Sì. Imposta `PLATFORM_NAME` (l'installer lo chiede): l'interfaccia e le email usano quello.

## Quali lingue sono supportate?

L'interfaccia è in italiano e in inglese, con un selettore in alto in ogni pagina. `PLATFORM_DEFAULT_LOCALE` sceglie
quella predefinita.

## Posso importare candidati da un altro strumento?

Sì: CV (anche in un archivio ZIP) e fogli di calcolo (CSV, XLSX), con un'anteprima prima di salvare qualsiasi cosa e la
possibilità di annullare dopo. I candidati importati ricevono un'email per riconfermare il consenso: finché non
riconfermano sono visibili solo nella pipeline del loro import, e se non riconfermano i loro dati vengono cancellati.

## Posso andarmene?

Sì. Un export completo dell'organizzazione, in formati aperti e documentati, è disponibile in qualsiasi momento, e i
dati di ogni candidato si possono esportare anche singolarmente.

## L'AI decide chi viene assunto?

No. Né l'assistente né alcuna automazione ordina, assegna punteggi, sposta o scarta i candidati: le automazioni possono
solo inviare un modello o creare un'attività quando una persona sposta una candidatura in una fase. L'assistente non
scrive mai a un candidato senza la conferma di una persona. Vedi [Assistente AI](./ai).

## Dove chiedo aiuto?

Apri una issue su [GitHub](https://github.com/fabrilallo/candydati/issues). Per i problemi di sicurezza usa il canale
privato descritto in [Sicurezza e privacy](./security#segnalare-una-vulnerabilita).
