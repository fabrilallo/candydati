import { z } from 'zod';
import { httpUrlSchema } from '../url/http-url.js';
import { personNameSchema } from './person-name.js';

/** Fields a recruiter may correct on the candidate's request (GDPR art. 16). `null` clears phone or LinkedIn. */
export const candidateCorrectionSchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'phone')
      .nullable()
      .optional(),
    linkedinUrl: httpUrlSchema.max(300).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'at_least_one_field');
export type CandidateCorrection = z.infer<typeof candidateCorrectionSchema>;

export const CORRECTABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'linkedinUrl'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
