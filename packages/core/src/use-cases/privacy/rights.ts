import type { z } from 'zod';
import type { CandidateRightsDeps } from '../../privacy-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the candidate-rights dependencies fixed. */
export const defineRightsUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<CandidateRightsDeps, S, O>,
): UseCase<CandidateRightsDeps, O> => defineUseCase<CandidateRightsDeps, S, O>(definition);

/** Names are compared ignoring case and surrounding or repeated spaces. */
export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
