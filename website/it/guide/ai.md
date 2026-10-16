# Assistente AI (facoltativo)

Candydati funziona del tutto anche senza AI. Con un modello configurato si attivano due cose:

| Variabile | Cosa attiva | Se vuota |
|---|---|---|
| `AGENT_MODEL` | l'assistente nell'interfaccia | l'assistente è spento e nessun modello viene chiamato |
| `FAST_MODEL` | il punteggio di qualità degli annunci con l'aiuto del modello, e i dati strutturati estratti dai CV | il punteggio usa solo regole, e dai CV si estrae solo il testo |

Entrambe prendono una stringa `fornitore/modello`, per esempio `openai/<modello>` o `anthropic/<modello>`, più la
chiave API di quel fornitore. L'installer le chiede; in seguito si cambiano con `candydati config`.

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

Imposta la chiave del fornitore indicato prima della `/`:

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
