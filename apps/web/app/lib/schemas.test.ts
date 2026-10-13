import { describe, expect, it } from 'vitest'
import { createOrganizationSchema, inviteSchema, loginSchema, signupSchema } from './schemas'

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }): string[] =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? [])

describe('loginSchema', () => {
  it('accepts a valid pair and trims the email', () => {
    const parsed = loginSchema.parse({ email: '  a@b.co ', password: 'x' })
    expect(parsed.email).toBe('a@b.co')
  })

  it('reports translation keys, not prose', () => {
    expect(messages(loginSchema.safeParse({ email: '', password: '' }))).toEqual(['validation.required', 'validation.required'])
    expect(messages(loginSchema.safeParse({ email: 'nope', password: 'x' }))).toEqual(['validation.email'])
  })
})

describe('signupSchema', () => {
  it('requires a name and a long enough password', () => {
    expect(messages(signupSchema.safeParse({ name: ' ', email: 'a@b.co', password: 'short' }))).toEqual(['validation.required', 'validation.passwordMin'])
    expect(signupSchema.safeParse({ name: 'Ada', email: 'a@b.co', password: 'longenough' }).success).toBe(true)
  })
})

describe('createOrganizationSchema', () => {
  it('validates name and slug', () => {
    expect(createOrganizationSchema.safeParse({ name: 'Acme', slug: 'acme' }).success).toBe(true)
    expect(messages(createOrganizationSchema.safeParse({ name: 'A', slug: 'Not Valid' }))).toEqual(['validation.nameMin', 'validation.slug'])
  })
})

describe('inviteSchema', () => {
  it('accepts domain roles only', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'recruiter' }).success).toBe(true)
    expect(messages(inviteSchema.safeParse({ email: 'a@b.co', role: 'god' }))).toEqual(['validation.role'])
  })
})
