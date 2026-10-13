import type { AuditAction, AuditTarget, Permission } from '@tt/domain';
import type { z } from 'zod';
import { toAuditActor, type Actor } from './actor.js';
import { assertSameOrganization, authorize } from './authorization.js';
import { AuditWriteError, ValidationError } from './errors.js';
import type { CoreDeps } from './ports.js';
import { inTransaction } from './transaction.js';

/** Explicit opt-out: the reason is mandatory so that skipping is visible in the definition. */
export interface Skip {
  readonly skip: string;
}

export interface AuditSpec<I, O> {
  /**
   * Fixed, or derived when one use case can produce several kinds of event. A function may return `null` for results
   * the handler already audited itself inside its own transaction (erasure): nothing is appended then.
   */
  readonly action: AuditAction | ((input: I, result: O) => AuditAction | null);
  readonly target: (input: I, result: O, actor: Actor) => AuditTarget;
  readonly metadata?: (input: I, result: O, actor: Actor) => Record<string, unknown>;
}

export interface HandlerContext<D, I> {
  readonly deps: D;
  readonly actor: Actor;
  readonly input: I;
}

export interface UseCaseDefinition<D extends CoreDeps, S extends z.ZodType, O> {
  readonly name: string;
  readonly input: S;
  /** A permission, or `{ skip: reason }` when the caller has already authorized (organization scope still applies). */
  readonly permission: Permission | Skip;
  /** Organization the input refers to. Omitted: the actor's own organization. */
  readonly organizationOf?: (input: z.output<S>) => string;
  /** An audit event, or `{ skip: reason }` for read-only use cases. */
  readonly audit: AuditSpec<z.output<S>, O> | Skip;
  /**
   * Audited use cases run in one transaction by default; a use case that skips the audit but writes says `'required'`.
   * `{ skip: reason }` for one that must not hold a transaction (long external calls; it opens its own when needed).
   */
  readonly transaction?: 'required' | Skip | undefined;
  readonly handler: (context: HandlerContext<D, z.output<S>>) => Promise<O>;
}

export interface UseCaseMeta {
  readonly name: string;
  /** `null` when the definition explicitly skips the permission check. */
  readonly permission: Permission | null;
}

export type UseCase<D extends CoreDeps, O> = ((deps: D, actor: Actor, rawInput: unknown) => Promise<O>) & {
  readonly meta: UseCaseMeta;
};

const isSkip = (value: unknown): value is Skip => typeof value === 'object' && value !== null && 'skip' in value;

export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new ValidationError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
}

async function appendAudit<D extends CoreDeps, I, O>(
  deps: D,
  actor: Actor,
  spec: AuditSpec<I, O>,
  organizationId: string,
  input: I,
  result: O,
): Promise<void> {
  const action = typeof spec.action === 'function' ? spec.action(input, result) : spec.action;
  if (action === null) return;
  try {
    await deps.auditLog.append({
      organizationId,
      actor: toAuditActor(actor),
      action,
      target: spec.target(input, result, actor),
      metadata: spec.metadata?.(input, result, actor) ?? {},
    });
  } catch (error) {
    throw new AuditWriteError(error);
  }
}

const isTransactional = <D extends CoreDeps, S extends z.ZodType, O>(definition: UseCaseDefinition<D, S, O>): boolean =>
  definition.transaction === undefined ? !isSkip(definition.audit) : definition.transaction === 'required';

/**
 * The only way to write a use case. Order: validate input, authorize, then in ONE transaction run the handler and append
 * the audit event; after the commit, the side effects it registered (queued tasks, emails) run.
 *
 * If the handler throws, nothing is audited and every write is rolled back. If the audit append fails,
 * `AuditWriteError` is thrown and the handler's writes are rolled back with it: no unlogged action, no half-done one.
 */
export function defineUseCase<D extends CoreDeps, S extends z.ZodType, O>(
  definition: UseCaseDefinition<D, S, O>,
): UseCase<D, O> {
  const run = async (deps: D, actor: Actor, rawInput: unknown): Promise<O> => {
    const input = parseInput(definition.input, rawInput);
    const organizationId = definition.organizationOf?.(input) ?? actor.organizationId;
    if (isSkip(definition.permission)) assertSameOrganization(actor, organizationId);
    else authorize(actor, definition.permission, organizationId);
    const audit = definition.audit;
    const execute = async (bound: D): Promise<O> => {
      const result = await definition.handler({ deps: bound, actor, input });
      if (!isSkip(audit)) await appendAudit(bound, actor, audit, organizationId, input, result);
      return result;
    };
    return isTransactional(definition) ? inTransaction(deps, execute) : execute(deps);
  };
  const meta: UseCaseMeta = {
    name: definition.name,
    permission: isSkip(definition.permission) ? null : definition.permission,
  };
  return Object.assign(run, { meta });
}

export interface PublicQueryDefinition<D, S extends z.ZodType, O> {
  readonly name: string;
  readonly input: S;
  readonly handler: (context: { readonly deps: D; readonly input: z.output<S> }) => Promise<O>;
}

export type PublicQuery<D, O> = ((deps: D, rawInput: unknown) => Promise<O>) & { readonly name: string };

/**
 * A read for visitors who are not signed in: validates the input (ValidationError), then runs the handler.
 * No actor, no permission check, no audit event.
 *
 * It must ONLY ever expose published data (public careers page, public job page, feeds). Never return drafts,
 * closed ads, internal ids, quality reports or anything else an organization has not chosen to publish, and
 * always scope the lookup to the organization named in the input.
 */
export function definePublicQuery<D, S extends z.ZodType, O>(definition: PublicQueryDefinition<D, S, O>): PublicQuery<D, O> {
  const run = async (deps: D, rawInput: unknown): Promise<O> =>
    definition.handler({ deps, input: parseInput(definition.input, rawInput) });
  return Object.defineProperty(run, 'name', { value: definition.name });
}

/**
 * A job run by the platform itself over every organization (deadline scan, publishing of outbox events): there is no
 * actor to authorize and no organization to scope the call to, so each repository call it makes carries the organization
 * of the row it is working on. Validates the input; nothing else. Never expose it through HTTP, the agent or MCP.
 */
export const defineSystemJob = <D, S extends z.ZodType, O>(definition: PublicQueryDefinition<D, S, O>): PublicQuery<D, O> =>
  definePublicQuery(definition);
