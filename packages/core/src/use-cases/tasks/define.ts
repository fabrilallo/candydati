import type { z } from 'zod';
import type { TaskDeps } from '../../automation-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineTaskUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<TaskDeps, S, O>): UseCase<TaskDeps, O> =>
  defineUseCase<TaskDeps, S, O>(definition);
