import { computed, readonly, ref, type Ref } from 'vue'
import type { z } from 'zod'
import { errorKeyOf } from '@/lib/auth-errors'

/** Field path -> translation key of the first problem. The UI resolves it with `t`. */
export type FormErrors = Readonly<Record<string, string>>

/** Pure: first message (a translation key) per field path. */
export const errorsByPath = (error: z.ZodError): FormErrors =>
  error.issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.map(String).join('.') || '_form'
    return path in acc ? acc : { ...acc, [path]: issue.message }
  }, {})

const omitKey = (errors: FormErrors, key: string): FormErrors => Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key))

/**
 * Small form state on top of a Zod schema: readonly values, immutable `setField`, `submit` validates with
 * `safeParse` and hands the typed output to the handler. A failing handler never goes unseen: its translation
 * key lands in `submitError`.
 */
export const useZodForm = <S extends z.ZodType>(schema: S, initial: z.input<S>) => {
  const values = ref(initial) as Ref<z.input<S>>
  const errors = ref<FormErrors>({})
  const pending = ref(false)
  const submitError = ref<string | null>(null)

  const setField = <K extends keyof z.input<S> & string>(key: K, value: z.input<S>[K]): void => {
    values.value = { ...(values.value as Record<string, unknown>), [key]: value } as z.input<S>
    errors.value = omitKey(errors.value, key)
  }

  const validate = (): z.output<S> | null => {
    const parsed = schema.safeParse(values.value)
    if (parsed.success) {
      errors.value = {}
      return parsed.data
    }
    errors.value = errorsByPath(parsed.error)
    return null
  }

  const submit = async (handler: (data: z.output<S>) => Promise<void> | void): Promise<boolean> => {
    const data = validate()
    if (data === null) return false
    pending.value = true
    submitError.value = null
    try {
      await handler(data)
      return true
    } catch (error) {
      submitError.value = errorKeyOf(error)
      return false
    } finally {
      pending.value = false
    }
  }

  const reset = (next: z.input<S> = initial): void => {
    values.value = next
    errors.value = {}
    submitError.value = null
  }

  return {
    values: readonly(values) as Readonly<Ref<z.input<S>>>,
    errors: readonly(errors),
    pending: readonly(pending),
    submitError: readonly(submitError),
    hasErrors: computed(() => Object.keys(errors.value).length > 0),
    setField,
    validate,
    submit,
    reset,
  }
}
