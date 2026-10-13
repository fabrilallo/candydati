# ADR 0002: Better Auth organizations

Status: accepted

## Context

We need multi-tenancy, roles, invitations and sessions, self-hostable, without writing an identity system.

## Decision

Use Better Auth with its organization plugin. Organizations are tenants; members and invitations map to roles declared in `packages/domain/src/access/permissions.ts`. Every domain table carries `organization_id` and every query filters by it.

## Consequences

Less security-critical code to maintain and a familiar model. We depend on the library's schema and upgrade path. Isolation relies on a discipline (the filter on every query) checked in review and tests.
