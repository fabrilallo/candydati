import type { z } from 'zod';
import type { ApiKeyDeps } from '../../api-key-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export const defineApiKeyUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<ApiKeyDeps, S, O>): UseCase<ApiKeyDeps, O> =>
  defineUseCase<ApiKeyDeps, S, O>(definition);
