## What and why

<!-- What changes, and why. Link the issue: Fixes #123 -->

## Checklist

- [ ] Tests written first; new code is covered (80% or more)
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Logic is in `packages/core`; routes, tools and MCP stay thin
- [ ] New use cases check permissions and write to the audit log
- [ ] Every new query filters by `organization_id`
- [ ] Input validated with Zod at the boundary
- [ ] No candidate ranking, scoring or automatic rejection added
- [ ] No secrets, personal data or third-party copyrighted material added
- [ ] Docs, ADR or CHANGELOG updated if behavior changed
- [ ] Commits follow Conventional Commits and are signed off (`git commit -s`, DCO)

## Test plan

- [ ] 
