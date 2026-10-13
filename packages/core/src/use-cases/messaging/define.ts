import type { z } from 'zod';
import type { MessagingDeps } from '../../messaging-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the messaging dependencies fixed. */
export const defineMessagingUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<MessagingDeps, S, O>,
): UseCase<MessagingDeps, O> => defineUseCase<MessagingDeps, S, O>(definition);
