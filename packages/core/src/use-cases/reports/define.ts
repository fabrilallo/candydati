import type { z } from 'zod';
import type { ReportDeps } from '../../report-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the report dependencies fixed. */
export const defineReportUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<ReportDeps, S, O>,
): UseCase<ReportDeps, O> => defineUseCase<ReportDeps, S, O>(definition);
