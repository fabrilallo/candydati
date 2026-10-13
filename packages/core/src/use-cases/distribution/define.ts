import type { z } from 'zod';
import type { DistributionDeps } from '../../distribution-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineDistributionUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<DistributionDeps, S, O>,
): UseCase<DistributionDeps, O> => defineUseCase<DistributionDeps, S, O>(definition);
