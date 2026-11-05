# ADR 0005: No automated decisions on candidates

Status: accepted

## Context

Ranking or rejecting people automatically raises GDPR art. 22 issues and conflicts with the candidate-side purpose of the product.

## Decision

The product and the assistant never order, score or reject candidates. The quality score evaluates job ads only. The assistant needs a person's confirmation before any message to a candidate. Interview feedback describes, it does not rate people. No "match" score exists.

## Consequences

A clear legal and ethical position and a simpler product. Some users will ask for screening features; the answer is no. An adversarial eval suite guards the assistant.

## Note (2026-11): proposals are not decisions

Automation rules (`propose_move`) and external assistants over MCP (`propose_stage_move`) may propose moving an
application to another stage. A proposal moves nothing and expires on its own; a person confirms it, through the normal
move with their own permission and audit entry, or dismisses it. Proposing requires `candidate:propose_move`, held by
exactly the roles that may move, reaches only the jobs the person reaches, and is opt-in for API keys and connected
apps. The reason an assistant gives is shown as plain text and treated as data. No proposal orders, scores or rejects
anyone, so the decision above stands.
