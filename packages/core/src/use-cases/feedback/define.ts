import type { z } from 'zod';
import type { FeedbackDeps, PublicFeedbackDeps } from '../../feedback-ports.js';
import { definePublicQuery, defineUseCase, type PublicQueryDefinition, type UseCase, type UseCaseDefinition } from '../../use-case.js';

/** `defineUseCase` with the feedback dependencies fixed. */
export const defineFeedbackUseCase = <S extends z.ZodType, O>(
  definition: UseCaseDefinition<FeedbackDeps, S, O>,
): UseCase<FeedbackDeps, O> => defineUseCase<FeedbackDeps, S, O>(definition);

export const definePublicFeedbackQuery = <S extends z.ZodType, O>(definition: PublicQueryDefinition<PublicFeedbackDeps, S, O>) =>
  definePublicQuery<PublicFeedbackDeps, S, O>(definition);
