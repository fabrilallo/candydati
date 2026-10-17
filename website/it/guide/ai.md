# AI (facoltativa)

Candydati funziona del tutto anche senza AI. Si possono accendere due modelli, separatamente:

| Modello | Cosa fa | Se spento |
|---|---|---|
| **Modello dell'assistente** | l'assistente nel pannello laterale: risponde a domande su annunci e candidati, scrive la bozza di un annuncio da una richiesta di assunzione, riassume le conversazioni | il pannello dice che l'assistente è spento; tutto il resto funziona |
| **Modello veloce** | i lavori brevi e frequenti: il punteggio di qualità degli annunci (al salvataggio e alla pubblicazione, anche via API e MCP) e la lettura dei CV di candidature e importazioni (ruoli, competenze, lingue). Conviene un modello piccolo ed economico | il punteggio usa solo regole, e dei CV si legge solo il testo |

**Dall'app (il modo più semplice).** Il primo proprietario o un amministratore dell'istanza apre **Impostazioni, AI** e
accende ciascun modello con il suo fornitore e il suo nome, poi incolla la chiave API di ogni fornitore usato (una sola
se i due modelli usano lo stesso fornitore). **Salva e prova i modelli** fa una piccola chiamata a ogni modello con la
sua chiave e salva solo se rispondono.
La chiave è cifrata e non viene più mostrata; le modifiche valgono subito, senza riavvio. Spegni entrambi i modelli per
fermare ogni chiamata.

**Modelli suggeriti.** La pagina propone `openai/gpt-6-luna` per l'assistente e `google/gemini-3.1-flash-lite` per il
modello veloce: quelli che usa chi sviluppa Candydati ogni giorno, non il risultato di un benchmark. Va bene qualsiasi
modello offerto dal fornitore.

**In alternativa, sul server.** `AGENT_MODEL` e `FAST_MODEL`, ciascuna una stringa `fornitore/modello`, più la chiave
del fornitore (sotto). Se sono impostate valgono loro, e l'app le mostra in sola lettura. L'installer le chiede; in
seguito si cambiano con `candydati config`.

**Privacy.** Con il modello veloce acceso, il testo dei CV va al fornitore scelto; anche ciò che legge l'assistente gli
arriva. Il fornitore diventa un sub-responsabile: va coperto dal tuo accordo sul trattamento dei dati e indicato
nell'informativa privacy.

## Cosa fa l'assistente

Lavora sul processo, con i permessi della persona che lo usa e mai di più. Scrive e corregge gli annunci, prepara
bozze di risposta, sollecita chi deve una risposta, segnala le candidature in scadenza, estrae dati strutturati dai CV
e guida gli import.

## Cosa non fa mai

- **Non ordina, non assegna punteggi e non scarta candidati.** Il prodotto non prende decisioni automatiche sulle
  persone.
- **Non invia mai un messaggio a un candidato da solo.** Ogni messaggio lo conferma una persona.
- **Chiudere, decidere e amministrare restano a una persona.** Né l'assistente né le chiavi API possono ricevere queste
  capacità.
- **Ogni azione è nel registro delle azioni**, segnata come azione dell'agente.
- **Il contenuto di CV ed email è un dato, non un'istruzione.** Una suite di test avversariali verifica che l'assistente
  non esegua quello che trova scritto lì dentro.
- **Non tiene memoria sul server.** La conversazione vive nel browser, quindi non c'è nulla in più da conservare,
  esportare o cancellare.

## Fornitori

Sul server, imposta la chiave del fornitore indicato prima della `/` (dall'app, incollala in Impostazioni, AI):

| Fornitore | Variabile |
|---|---|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

Usa un nome di modello che il fornitore offre oggi. Il fornitore del modello tratta dati dei candidati per tuo conto:
inseriscilo tra i tuoi sub-responsabili (vedi [Sicurezza e privacy](./security)). Nel registro dei trattamenti mostrato
nell'app compare solo il nome del fornitore, mai il modello o la chiave.

## Budget giornalieri

Le chiamate a pagamento ai modelli hanno un tetto giornaliero (giorno UTC), così un errore o una chiave trapelata non
possono generare una spesa alta:

| Variabile | Predefinito | Limite |
|---|---|---|
| `ASSISTANT_DAILY_BUDGET_PER_USER` | 200 | richieste all'assistente per persona |
| `ASSISTANT_DAILY_BUDGET_PER_ORGANIZATION` | 2000 | richieste all'assistente per organizzazione |
| `MCP_MODEL_DAILY_BUDGET_PER_KEY` | 200 | strumenti MCP che usano il modello, per chiave API |
| `MCP_MODEL_DAILY_BUDGET_PER_USER` | 300 | gli stessi, per persona su tutte le chiavi e organizzazioni |
| `MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION` | 1000 | gli stessi, per organizzazione |
| `CV_MODEL_DAILY_BUDGET` | 1000 | estrazioni di CV per organizzazione che possono chiamare il modello; oltre, si estrae solo il testo |

Imposta anche un limite di spesa presso il fornitore del modello.
