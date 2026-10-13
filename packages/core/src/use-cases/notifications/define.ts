import type { z } from 'zod';
import type { NotificationDeps } from '../../automation-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineNotificationUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<NotificationDeps, S, O>,
): UseCase<NotificationDeps, O> => defineUseCase<NotificationDeps, S, O>(definition);
