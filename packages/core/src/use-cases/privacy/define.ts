import type { z } from 'zod';
import type { PrivacyDeps } from '../../candidate-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the privacy dependencies fixed. */
export const definePrivacyUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<PrivacyDeps, S, O>,
): UseCase<PrivacyDeps, O> => defineUseCase<PrivacyDeps, S, O>(definition);
