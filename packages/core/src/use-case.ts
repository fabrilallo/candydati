import type { AuditAction, AuditActor, AuditTarget, Permission } from '@tt/domain';
import type { z } from 'zod';
import type { JobScope } from '@tt/domain';
import { jobScopeOf, scopeDeps, unscopedDeps } from './access/scope-deps.js';
import { toAuditActor, type Actor } from './actor.js';
import { assertSameOrganization, authorize } from './authorization.js';
import { AuditWriteError, ValidationError } from './errors.js';
import type { AuditLogRepository, CoreDeps } from './ports.js';
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
  /** Repositories already limited to the jobs the actor reaches. */
  readonly deps: D;
  readonly actor: Actor;
  readonly input: I;
  /** The jobs the actor reaches (resolved on first call), for the rare handler that must tell scoped actors apart. */
  readonly jobScope: () => Promise<JobScope>;
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
 * The only way to write a use case. Order: authorize the role, validate input, scope to the organization, then in ONE transaction run the handler and append
 * the audit event; after the commit, the side effects it registered (queued tasks, emails) run. The handler receives its
 * repositories scoped to the jobs the actor reaches (`access/scope-deps.ts`): per-job access cannot be skipped.
 *
 * If the handler throws, nothing is audited and every write is rolled back. If the audit append fails,
 * `AuditWriteError` is thrown and the handler's writes are rolled back with it: no unlogged action, no half-done one.
 */
export function defineUseCase<D extends CoreDeps, S extends z.ZodType, O>(
  definition: UseCaseDefinition<D, S, O>,
): UseCase<D, O> {
  const run = async (given: D, actor: Actor, rawInput: unknown): Promise<O> => {
    // The permission is checked on the role alone first: someone who may not do this learns nothing about the input schema.
    if (!isSkip(definition.permission)) authorize(actor, definition.permission);
    const input = parseInput(definition.input, rawInput);
    const organizationId = definition.organizationOf?.(input) ?? actor.organizationId;
    assertSameOrganization(actor, organizationId);
    const audit = definition.audit;
    // Called from another use case: start again from the unscoped deps, then scope them for this actor.
    const deps = unscopedDeps(given);
    const execute = async (bound: D): Promise<O> => {
      // Per-job access (PRODUCT.md §6): the handler only ever sees repositories limited to the jobs the actor reaches.
      const scope = jobScopeOf(bound, actor);
      const result = await definition.handler({ deps: scopeDeps(bound, actor, scope), actor, input, jobScope: scope.scope });
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

const READ_ONLY = 'definePublicQuery is read-only: a public write is a definePublicCommand.';

const refuse = (): never => {
  throw new Error(READ_ONLY);
};

/** `deps` with every way to write through core taken away: no transaction to open, no audit event to append. */
function readOnly<D>(deps: D): D {
  if (typeof deps !== 'object' || deps === null) return deps;
  const source = deps as Record<string, unknown> & { readonly auditLog?: AuditLogRepository };
  return {
    ...source,
    ...('transaction' in source ? { transaction: { run: refuse } } : {}),
    ...(source.auditLog ? { auditLog: { ...source.auditLog, append: refuse } } : {}),
    afterCommit: undefined,
  } as D;
}

const named = <F extends (...args: never[]) => unknown>(run: F, name: string): F & { readonly name: string } =>
  Object.defineProperty(run, 'name', { value: name });

/**
 * A read for visitors who are not signed in: validates the input (ValidationError), then runs the handler.
 * No actor, no permission check, no audit event. Read-only, enforced: the handler cannot open a transaction or append
 * to the audit log (a public write is a `definePublicCommand`).
 *
 * It must ONLY ever expose published data (public careers page, public job page, feeds). Never return drafts,
 * closed ads, internal ids, quality reports or anything else an organization has not chosen to publish, and
 * always scope the lookup to the organization named in the input.
 */
export function definePublicQuery<D, S extends z.ZodType, O>(definition: PublicQueryDefinition<D, S, O>): PublicQuery<D, O> {
  const run = async (deps: D, rawInput: unknown): Promise<O> =>
    definition.handler({ deps: readOnly(deps), input: parseInput(definition.input, rawInput) });
  return named(run, definition.name);
}

/** The audit event of a public command: no user, so the organization comes from what the handler found. */
export interface PublicAuditSpec<I, O> {
  /** `null` for results that change nothing (a duplicate, an unknown token). */
  readonly action: AuditAction | ((input: I, result: O) => AuditAction | null);
  readonly organizationOf: (input: I, result: O) => string;
  readonly target: (input: I, result: O) => AuditTarget;
  readonly metadata?: (input: I, result: O) => Record<string, unknown>;
}

export interface PublicCommandDefinition<D extends object, S extends z.ZodType, O> {
  readonly name: string;
  readonly input: S;
  /** Id of the system actor the audit log records for this public surface (`inbound_email`, `consent_page`, ...). */
  readonly actorId: string;
  /** An audit event, or `{ skip: reason }` when the handler audits inside the command's transaction itself. */
  readonly audit: PublicAuditSpec<z.output<S>, O> | Skip;
  /** `{ skip: reason }` only for a write that manages its own transaction (an upload must not hold one). */
  readonly transaction?: Skip | undefined;
  readonly handler: (context: { readonly deps: D; readonly input: z.output<S>; readonly actor: AuditActor }) => Promise<O>;
}

async function appendPublicAudit<I, O>(deps: Partial<CoreDeps>, actor: AuditActor, spec: PublicAuditSpec<I, O>, input: I, result: O): Promise<void> {
  const action = typeof spec.action === 'function' ? spec.action(input, result) : spec.action;
  if (action === null) return;
  if (!deps.auditLog) throw new AuditWriteError(new Error('no audit log in the dependencies'));
  try {
    await deps.auditLog.append({ organizationId: spec.organizationOf(input, result), actor, action, target: spec.target(input, result), metadata: spec.metadata?.(input, result) ?? {} });
  } catch (error) {
    throw new AuditWriteError(error);
  }
}

/**
 * A write by a visitor who is not signed in (inbound email webhook, interview feedback form, consent page): validates
 * the input, then runs the handler and appends its audit event in ONE transaction, like `defineUseCase`. There is no
 * user: the audit actor is the system actor of the page. Authorization is the caller's (a signature, a single-use token).
 */
export function definePublicCommand<D extends object, S extends z.ZodType, O>(definition: PublicCommandDefinition<D, S, O>): PublicQuery<D, O> {
  const actor: AuditActor = { type: 'system', id: definition.actorId, onBehalfOfUserId: null };
  const run = async (deps: D, rawInput: unknown): Promise<O> => {
    const input = parseInput(definition.input, rawInput);
    const audit = definition.audit;
    const execute = async (bound: D): Promise<O> => {
      const result = await definition.handler({ deps: bound, input, actor });
      if (!isSkip(audit)) await appendPublicAudit(bound as Partial<CoreDeps>, actor, audit, input, result);
      return result;
    };
    if (definition.transaction !== undefined) return execute(deps);
    const transactional = deps as D & Partial<CoreDeps>;
    if (!transactional.transaction) throw new Error(`${definition.name}: a public command needs a unit of work`);
    return inTransaction(transactional as D & CoreDeps, execute);
  };
  return named(run, definition.name);
}

/**
 * A job run by the platform itself over every organization (deadline scan, publishing of outbox events): there is no
 * actor to authorize and no organization to scope the call to, so each repository call it makes carries the organization
 * of the row it is working on. Validates the input; nothing else (it may write: unlike a public query). Never expose it
 * through HTTP, the agent or MCP.
 */
export function defineSystemJob<D, S extends z.ZodType, O>(definition: PublicQueryDefinition<D, S, O>): PublicQuery<D, O> {
  const run = async (deps: D, rawInput: unknown): Promise<O> => definition.handler({ deps, input: parseInput(definition.input, rawInput) });
  return named(run, definition.name);
}
