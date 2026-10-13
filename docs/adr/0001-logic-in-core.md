# ADR 0001: Logic in core, thin adapters

Status: accepted

## Context

The product must be usable from the web UI, a REST API, an internal assistant and an MCP server. Writing the rules once per surface would drift apart and give different permissions on each.

## Decision

All business logic lives in `packages/core` as use cases. REST routes, assistant tools and MCP tools are thin adapters that validate input, build an actor and call the use case. `packages/domain` holds schemas and permissions with no I/O.

## Consequences

Every surface has the same behavior, permissions and audit trail. Adding a surface is cheap. Use cases are tested without HTTP. Adapters must stay free of rules, which review enforces.
