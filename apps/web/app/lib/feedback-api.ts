import { applicationFeedbackSchema, publicFeedbackSchema, type ApplicationFeedbackDto, type FeedbackSubmission, type PublicFeedbackDto } from '@candydati/domain'
import { z } from 'zod'
import { applicationFeedbackPath, publicFeedbackPath, requestFeedbackPath } from './api-paths'
import { callApi } from './api-call'
import { consentFailure, type ConsentFailure } from './import-api'
import type { JobApiRequest } from './job-api'
import type { FeedbackRequestInput } from './feedback-view'

/** Interview feedback over HTTP (phase 9 contract, section C): the public form by token and the candidate tab. */
export type FeedbackFailure = ConsentFailure

/** Pure: what the public page says when the token does not work (same reasons as the reconfirmation). */
export const feedbackFailure = (error: unknown): FeedbackFailure => consentFailure(error)

export type FeedbackLoad = { readonly kind: 'ok'; readonly data: PublicFeedbackDto } | { readonly kind: 'failed'; readonly failure: FeedbackFailure }

/** Never throws: the page shows the form or the reason it cannot. */
export const loadPublicFeedback = async (request: JobApiRequest, token: string): Promise<FeedbackLoad> => {
  try {
    return { kind: 'ok', data: (await callApi(request, publicFeedbackPath(token), publicFeedbackSchema)).data }
  } catch (error) {
    const failure = feedbackFailure(error)
    if (failure === 'unavailable') console.error('[feedback] load failed', error instanceof Error ? error.message : error)
    return { kind: 'failed', failure }
  }
}

export const submitPublicFeedback = async (request: JobApiRequest, token: string, submission: FeedbackSubmission): Promise<void> => {
  await callApi(request, publicFeedbackPath(token), z.unknown(), { method: 'POST', body: submission })
}

export const listApplicationFeedback = async (request: JobApiRequest, applicationId: string): Promise<ApplicationFeedbackDto> =>
  (await callApi(request, applicationFeedbackPath(applicationId), applicationFeedbackSchema)).data

export const requestFeedback = async (request: JobApiRequest, applicationId: string, input: FeedbackRequestInput): Promise<void> => {
  await callApi(request, requestFeedbackPath(applicationId), z.unknown(), { method: 'POST', body: input })
}
