import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from '@/lib/auth-errors'
import { errorsByPath, useZodForm } from './useZodForm'

const schema = z.object({ email: z.email('validation.email'), age: z.number().int().min(18, 'validation.age') })

describe('errorsByPath', () => {
  it('keeps the first message per field', () => {
    const result = schema.safeParse({ email: 'x', age: 3 })
    expect(result.success).toBe(false)
    if (!result.success) expect(errorsByPath(result.error)).toEqual({ email: 'validation.email', age: 'validation.age' })
  })

  it('files form-level problems under _form', () => {
    const result = z.string().min(3, 'short').safeParse('a')
    if (!result.success) expect(errorsByPath(result.error)).toEqual({ _form: 'short' })
  })
})

describe('useZodForm', () => {
  it('updates fields immutably and clears the field error', async () => {
    const initial = { email: '', age: 0 }
    const form = useZodForm(schema, initial)
    expect(await form.submit(() => undefined)).toBe(false)
    expect(form.hasErrors.value).toBe(true)
    form.setField('email', 'a@b.it')
    expect(form.errors.value.email).toBeUndefined()
    expect(form.values.value.email).toBe('a@b.it')
    expect(initial.email).toBe('')
  })

  it('submits the parsed data and tracks pending', async () => {
    const form = useZodForm(schema, { email: 'a@b.it', age: 30 })
    let received: unknown = null
    expect(await form.submit((data) => void (received = data))).toBe(true)
    expect(received).toEqual({ email: 'a@b.it', age: 30 })
    expect(form.pending.value).toBe(false)
  })

  it('never swallows a handler failure: it becomes a translation key', async () => {
    const form = useZodForm(schema, { email: 'a@b.it', age: 30 })
    expect(await form.submit(() => Promise.reject(new AppError('errors.emailTaken')))).toBe(false)
    expect(form.submitError.value).toBe('errors.emailTaken')
    expect(await form.submit(() => Promise.reject(new Error('internal detail')))).toBe(false)
    expect(form.submitError.value).toBe('errors.generic')
    form.reset()
    expect(form.submitError.value).toBeNull()
    expect(form.errors.value).toEqual({})
  })
})
