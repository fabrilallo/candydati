import type { z } from 'zod';
import type { JobDeps, PublicJobDeps } from '../../job-ports.js';
import { definePublicQuery, defineUseCase, type PublicQueryDefinition, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the job dependencies fixed, so handlers get typed `deps` without explicit generics. */
export const defineJobUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<JobDeps, S, O>,
): UseCase<JobDeps, O> => defineUseCase<JobDeps, S, O>(definition);

export const definePublicJobQuery = <S extends z.ZodType, O>(definition: PublicQueryDefinition<PublicJobDeps, S, O>) =>
  definePublicQuery<PublicJobDeps, S, O>(definition);
