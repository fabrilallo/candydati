# ADR 0005: No automated decisions on candidates

Status: accepted

## Context

Ranking or rejecting people automatically raises GDPR art. 22 issues and conflicts with the candidate-side purpose of the product.

## Decision

The product and the assistant never order, score or reject candidates. The quality score evaluates job ads only. The assistant needs a person's confirmation before any message to a candidate. Interview feedback describes, it does not rate people. No "match" score exists.

## Consequences

A clear legal and ethical position and a simpler product. Some users will ask for screening features; the answer is no. An adversarial eval suite guards the assistant.
