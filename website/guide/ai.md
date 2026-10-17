# AI (optional)

Candydati works completely without AI. Two models can be switched on, separately:

| Model | What it does | When off |
|---|---|---|
| **Assistant model** | the assistant in the side panel: answers questions about your jobs and candidates, drafts a job ad from a hiring request, summarises conversations | the panel says the assistant is off; everything else works |
| **Fast model** | short, frequent tasks: the job ad quality score (on save and publish, also through the API and MCP) and reading CVs of applications and imports (roles, skills, languages). A small, inexpensive model is best | the score uses rules only, and only the plain text of CVs is read |

**From the app (the simplest way).** The first owner or an instance admin opens **Settings, AI** and switches each
model on with its own provider and model name, then pastes the API key of each provider in use (one key when both use
the same provider). **Save and test the models** sends one tiny call to each model with its key and saves only if they
answer. The key is encrypted at
rest and never shown again; changes apply without a restart. Switch both models off to stop every model call.

**Suggested models.** The page proposes `openai/gpt-6-luna` for the assistant and `google/gemini-3.1-flash-lite` for
the fast model: the ones the maintainers use day to day, not the result of a benchmark. Any model the provider offers
works.

**On the server instead.** `AGENT_MODEL` and `FAST_MODEL`, each a `provider/model` string, plus the provider key
(below). When set, they win and the app shows them read-only. The installer asks for them; later, change them with
`candydati config`.

**Privacy.** With the fast model on, the text of CVs goes to the chosen provider; whatever the assistant reads goes to
it too. The provider becomes a sub-processor: it must be covered by your data processing agreement and listed in your
privacy notice.

## What the assistant does

It works on the process, with the permissions of the person using it, never more. It writes and corrects job ads,
drafts replies, nudges whoever owes a response, flags applications about to expire, extracts structured data from CVs
and guides imports.

## What it never does

- **It does not rank, score or reject candidates.** The product takes no automated decisions about people.
- **It never sends a message to a candidate on its own.** A person confirms every message.
- **Closing, deciding and administration stay with a person.** Neither the assistant nor API keys can be given those
  capabilities.
- **Every action is in the audit log**, marked as an agent action.
- **CV and email contents are data, not instructions.** An adversarial test suite checks that the assistant does not
  act on what it finds written in them.
- **It keeps no memory on the server.** The conversation lives in the browser, so there is nothing extra to retain,
  export or erase.

## Providers

On the server, set the key of the provider named before the `/` (from the app, paste it in Settings, AI):

| Provider | Variable |
|---|---|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

Use a model name the provider currently offers. The model provider processes candidate data on your behalf: list it
among your sub-processors (see [Security and privacy](./security)). Only the provider's name, never the model or the
key, appears in the processing register shown in the app.

## Daily budgets

Paid model calls are capped per day (UTC), so a mistake or a leaked key cannot run up a large bill:

| Variable | Default | Limit |
|---|---|---|
| `ASSISTANT_DAILY_BUDGET_PER_USER` | 200 | assistant requests per person |
| `ASSISTANT_DAILY_BUDGET_PER_ORGANIZATION` | 2000 | assistant requests per organization |
| `MCP_MODEL_DAILY_BUDGET_PER_KEY` | 200 | model-backed MCP tools per API key |
| `MCP_MODEL_DAILY_BUDGET_PER_USER` | 300 | the same, per person across keys and organizations |
| `MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION` | 1000 | the same, per organization |
| `CV_MODEL_DAILY_BUDGET` | 1000 | CV extractions per organization that may call the model; above it, only the text is extracted |

Set a spending limit at the model provider as well.
