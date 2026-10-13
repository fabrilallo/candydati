import type { z } from 'zod';
import type { JobRequestDeps } from '../../job-request-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineJobRequestUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<JobRequestDeps, S, O>,
): UseCase<JobRequestDeps, O> => defineUseCase<JobRequestDeps, S, O>(definition);
