import type { z } from 'zod';
import type { MigrationDeps } from '../../migration-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the migration dependencies fixed. Every migration use case needs `migration:manage`. */
export const defineMigrationUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<MigrationDeps, S, O>): UseCase<MigrationDeps, O> =>
  defineUseCase<MigrationDeps, S, O>(definition);
