import type { z } from 'zod';
import type { CareersDeps, PublicCareersDeps } from '../../careers-ports.js';
import { definePublicQuery, defineUseCase, type PublicQueryDefinition, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the careers page dependencies fixed. */
export const defineCareersUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<CareersDeps, S, O>): UseCase<CareersDeps, O> =>
  defineUseCase<CareersDeps, S, O>(definition);

export const definePublicCareersQuery = <S extends z.ZodType, O>(definition: PublicQueryDefinition<PublicCareersDeps, S, O>) =>
  definePublicQuery<PublicCareersDeps, S, O>(definition);
