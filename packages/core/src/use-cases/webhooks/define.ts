import type { z } from 'zod';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import type { WebhookDeps } from '../../webhook-ports.js';

export const defineWebhookUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<WebhookDeps, S, O>): UseCase<WebhookDeps, O> =>
  defineUseCase<WebhookDeps, S, O>(definition);
