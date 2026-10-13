# ADR 0006: Models only through Mastra

Status: accepted

## Context

Operators want to choose the provider, including local models, and the GDPR documents must list sub-processors accurately.

## Decision

LLM access goes only through Mastra, with `provider/model` strings from env (`AGENT_MODEL`, `FAST_MODEL`). No vendor SDK is imported in the code. Empty values turn the assistant off and make no model call. Deterministic rules back every model feature that must work offline.

## Consequences

Provider swap is configuration. Self-hosters can stay fully local. We are bound to Mastra's abstractions and release pace.
