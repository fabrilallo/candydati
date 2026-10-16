# AI assistant (optional)

Candydati works completely without AI. With a model configured, two things switch on:

| Variable | What it enables | When empty |
|---|---|---|
| `AGENT_MODEL` | the assistant in the interface | the assistant is off and no model is called |
| `FAST_MODEL` | the model-assisted job ad quality score, and structured data extracted from CVs | the score uses rules only, and only the text is extracted from CVs |

Both take a `provider/model` string, for example `openai/<model>` or `anthropic/<model>`, plus the API key of that
provider. The installer asks for them; later, change them with `candydati config`.

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

Set the key of the provider named before the `/`:

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
