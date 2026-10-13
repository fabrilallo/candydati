import type { z } from 'zod';
import type { ImportDeps } from '../../import-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the import dependencies fixed. */
export const defineImportUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<ImportDeps, S, O>): UseCase<ImportDeps, O> =>
  defineUseCase<ImportDeps, S, O>(definition);
