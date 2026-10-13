import { describe, expect, it } from 'vitest'
import { emptyForm } from '@/lib/job-form'

describe('useJobDraft', () => {
  it('tracks changes against the last saved state and replaces the form instead of mutating it', () => {
    const initial = Object.freeze({ ...emptyForm(), title: 'Idea' })
    const draft = useJobDraft(initial)
    expect(draft.dirty.value).toBe(false)

    draft.patch({ title: 'Nuovo titolo' })
    expect(draft.dirty.value).toBe(true)
    expect(draft.form.value).not.toBe(initial)
    expect(initial.title).toBe('Idea')

    draft.markSaved(draft.form.value)
    expect(draft.dirty.value).toBe(false)
  })

  it('keeps the dirty flag when more is typed while a save is in flight', () => {
    const draft = useJobDraft(emptyForm())
    draft.patch({ title: 'A' })
    const sent = draft.form.value
    draft.patch({ title: 'AB' })
    draft.markSaved(sent)
    expect(draft.dirty.value).toBe(true)
  })

  it('recomputes the publish check as the form changes', () => {
    const draft = useJobDraft(emptyForm())
    expect(draft.check.value.publishable).toBe(false)
    expect(draft.check.value.issues[0]).toEqual({ path: 'title', rule: 'required' })
    draft.patch({ title: 'x' })
    expect(draft.check.value.issues.some((issue) => issue.path === 'title')).toBe(false)
  })
})
