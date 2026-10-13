import type { z } from 'zod';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineAutomationUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<AutomationRuleDeps, S, O>,
): UseCase<AutomationRuleDeps, O> => defineUseCase<AutomationRuleDeps, S, O>(definition);
