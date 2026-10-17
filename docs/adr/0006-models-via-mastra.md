# ADR 0006: Models only through Mastra

Status: accepted

## Context

Operators want to choose the provider, including local models, and the GDPR documents must list sub-processors accurately.

## Decision

LLM access goes only through Mastra. The `provider/model` comes from env (`AGENT_MODEL`, `FAST_MODEL`), which wins, or from the instance AI settings saved in the app (Settings, AI: one provider, its key sealed at rest, the assistant model and the fast model, each switchable off); an app key is passed to Mastra explicitly (`{ id, apiKey }`), never written to the process environment, and changes apply without a restart. No vendor SDK is imported in the code. No model turns the assistant off and makes no model call. Deterministic rules back every model feature that must work offline.

## Consequences

Provider swap is configuration. Self-hosters can stay fully local. We are bound to Mastra's abstractions and release pace.
