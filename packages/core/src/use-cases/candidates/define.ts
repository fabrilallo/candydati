import type { z } from 'zod';
import type { CandidateDeps } from '../../candidate-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the candidate dependencies fixed. */
export const defineCandidateUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<CandidateDeps, S, O>,
): UseCase<CandidateDeps, O> => defineUseCase<CandidateDeps, S, O>(definition);
