import type { z } from 'zod';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineSourcingUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<SourcingDeps, S, O>): UseCase<SourcingDeps, O> =>
  defineUseCase<SourcingDeps, S, O>(definition);
