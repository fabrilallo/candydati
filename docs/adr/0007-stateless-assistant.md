# ADR 0007: Stateless assistant

Status: accepted

## Context

Conversations with the assistant can contain candidate data. Storing them adds a new personal-data store to retain, export, erase and audit.

## Decision

The assistant keeps no server-side memory. The client sends the recent history (capped in messages and size) on each request; only user and assistant roles are accepted, so a client cannot inject system messages. Assistant tool calls are audited like any other action.

## Consequences

No extra retention or erasure surface for chat. History is lost when the panel closes. Long context is trimmed on the server.
