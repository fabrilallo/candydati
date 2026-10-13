# ADR 0004: Outbox for webhooks and automations

Status: accepted

## Context

Webhooks, automations and notifications must reflect committed changes, never a rolled-back one, and must survive crashes and retries.

## Decision

Use cases insert an `outbox_event` in the same transaction as the change. The worker reads unpublished events, delivers signed webhooks, runs automation rules and creates notifications, with retries and per-delivery records.

## Consequences

At-least-once delivery without a message broker: Postgres and pg-boss are enough for self-hosting. Consumers must be idempotent. Delivery has a small delay.
