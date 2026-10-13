import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, ROLES } from '@tt/domain'
import { z } from 'zod'
import { isValidSlug } from './slug'

/**
 * Form schemas. Messages are translation keys (resolved by the UI with `t`), so validation stays
 * language-free and the same schema serves both locales.
 */
const required = 'validation.required'
const email = z.string().trim().min(1, required).pipe(z.email('validation.email'))


export const loginSchema = z.object({
  email,
  password: z.string().min(1, required),
})
export type LoginInput = z.infer<typeof loginSchema>

export const signupSchema = z.object({
  name: z.string().trim().min(1, required).max(80, 'validation.nameMax'),
  email,
  password: z.string().min(PASSWORD_MIN_LENGTH, 'validation.passwordMin').max(PASSWORD_MAX_LENGTH, 'validation.passwordMax'),
})
export type SignupInput = z.infer<typeof signupSchema>

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'validation.nameMin').max(80, 'validation.nameMax'),
  slug: z.string().refine(isValidSlug, 'validation.slug'),
})
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

export const inviteSchema = z.object({
  email,
  role: z.enum(ROLES, 'validation.role'),
})
export type InviteInput = z.infer<typeof inviteSchema>
