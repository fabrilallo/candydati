import { z } from 'zod';
import { NAME_MAX } from './application.js';

/** Fields a recruiter may correct on the candidate's request (GDPR art. 16). `null` clears phone or LinkedIn. */
export const candidateCorrectionSchema = z
  .object({
    firstName: z.string().trim().min(1).max(NAME_MAX).optional(),
    lastName: z.string().trim().min(1).max(NAME_MAX).optional(),
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
    linkedinUrl: z.url().max(300).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'at_least_one_field');
export type CandidateCorrection = z.infer<typeof candidateCorrectionSchema>;

export const CORRECTABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'linkedinUrl'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
