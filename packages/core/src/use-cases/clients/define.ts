import type { z } from 'zod';
import type { ClientDeps, PublicShortlistDeps, ShortlistDeps } from '../../client-ports.js';
import { ConflictError } from '../../errors.js';
import { definePublicCommand, definePublicQuery, defineUseCase, type PublicCommandDefinition, type PublicQueryDefinition, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the client dependencies fixed. */
export const defineClientUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<ClientDeps, S, O>): UseCase<ClientDeps, O> =>
  defineUseCase<ClientDeps, S, O>(definition);

export const defineShortlistUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<ShortlistDeps, S, O>): UseCase<ShortlistDeps, O> =>
  defineUseCase<ShortlistDeps, S, O>(definition);

export const definePublicShortlistQuery = <S extends z.ZodType, O>(definition: PublicQueryDefinition<PublicShortlistDeps, S, O>) =>
  definePublicQuery<PublicShortlistDeps, S, O>(definition);

export const definePublicShortlistCommand = <S extends z.ZodType, O>(definition: PublicCommandDefinition<PublicShortlistDeps, S, O>) =>
  definePublicCommand<PublicShortlistDeps, S, O>(definition);

/** Clients exist only for an organization that said it recruits for clients (PRODUCT.md §3.5). */
export async function requireAgency(deps: Pick<ClientDeps, 'organizationSettings'>, organizationId: string): Promise<void> {
  if (!(await deps.organizationSettings.get(organizationId)).recruitsForClients) throw new ConflictError('clients_off');
}
