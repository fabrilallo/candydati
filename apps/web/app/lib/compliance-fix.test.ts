import { describe, expect, it } from 'vitest'
import { fixesFor, patchAt, removePhrase, replacePhrase, slotOf, textAt } from './compliance-fix'
import { emptyForm, emptyStage, type JobForm } from './job-form'

const form = (overrides: Partial<JobForm> = {}): JobForm => ({ ...emptyForm(), ...overrides })
const issue = (rule: string, path: string, match: string, suggestion = '') => ({ rule, path, match, suggestion })

describe('slots of a content path', () => {
  it('maps text fields, list items, the bonus and stage notes', () => {
    expect(slotOf('title')).toEqual({ kind: 'text', field: 'title' })
    expect(slotOf('employment.bonus')).toEqual({ kind: 'text', field: 'bonus' })
    expect(slotOf('requirements.mustHave.2')).toEqual({ kind: 'list', field: 'mustHave', index: 2 })
    expect(slotOf('process.1.note')).toEqual({ kind: 'note', index: 1 })
    expect(slotOf('salary.min')).toBeNull()
    expect(slotOf('unknown.3')).toBeNull()
  })

  it('reads and writes stage notes counting only the stages that are sent', () => {
    const f = form({ process: [emptyStage(), { ...emptyStage(), type: 'hr_interview', note: 'Con il candidato' }] })
    expect(textAt(f, 'process.0.note')).toBe('Con il candidato')
    const patch = patchAt(f, 'process.0.note', 'Con chi si candida')
    expect(patch.process?.[1]?.note).toBe('Con chi si candida')
    expect(patch.process?.[0]).toBe(f.process[0])
    expect(textAt(f, 'process.5.note')).toBeNull()
    expect(patchAt(f, 'salary.min', 'x')).toEqual({})
    expect(textAt(f, 'salary.min')).toBeNull()
  })
})

describe('text surgery', () => {
  it('removes a phrase and tidies the punctuation around it', () => {
    expect(removePhrase('Laurea, età massima 35 anni, inglese', 'Età massima 35 anni')).toBe('Laurea, inglese')
    expect(removePhrase('Bella presenza e ottima dialettica', 'bella presenza')).toBe('e ottima dialettica')
    expect(removePhrase('Ruolo (max 30 anni)', 'max 30 anni')).toBe('Ruolo')
    expect(removePhrase('Testo', 'assente')).toBe('Testo')
    expect(removePhrase('Età massima 35 anni', 'Età massima')).toBe('')
  })

  it('replaces keeping the capital at the start of a sentence', () => {
    expect(replacePhrase('Il candidato ideale ha', 'il candidato ideale', 'la persona ideale')).toBe('La persona ideale ha')
    expect(replacePhrase('cerchiamo', 'nulla', 'x')).toBe('cerchiamo')
  })
})

describe('fixes for a finding', () => {
  it('adds (m/f) to a masculine-only title and offers the inclusive title of the domain', () => {
    const f = form({ title: 'Sviluppatore backend' })
    const fixes = fixesFor(f, issue('gender_exclusive_title', 'title', 'Sviluppatore', 'Sviluppatore/trice backend'))
    expect(fixes.map((fix) => fix.patch)).toEqual([{ title: 'Sviluppatore backend (m/f)' }, { title: 'Sviluppatore/trice backend' }])
    expect(fixes[0]?.labelKey).toBe('job.compliance.fix.addMarker')
    expect(fixesFor(f, issue('gender_exclusive_title', 'title', 'Sviluppatore', 'Sviluppatore backend (m/f)'))).toHaveLength(1)
  })

  it('drops a requirement that only stated an age limit', () => {
    const f = form({ mustHave: ['Node.js', 'Età massima 35 anni'] })
    const [fix] = fixesFor(f, issue('discriminatory_requirement', 'requirements.mustHave.1', 'Età massima 35 anni'))
    expect(fix?.labelKey).toBe('job.compliance.fix.removeItem')
    expect(fix?.patch).toEqual({ mustHave: ['Node.js'] })
    expect(f.mustHave).toHaveLength(2)
  })

  it('takes the words out of a longer text', () => {
    const f = form({ summary: 'Cerchiamo una persona, bella presenza, con esperienza.' })
    const [fix] = fixesFor(f, issue('discriminatory_requirement', 'summary', 'bella presenza'))
    expect(fix?.labelKey).toBe('job.compliance.fix.remove')
    expect(fix?.patch).toEqual({ summary: 'Cerchiamo una persona, con esperienza.' })
  })

  it('rewrites masculine phrasing inclusively, and offers nothing it cannot rewrite', () => {
    const f = form({ summary: 'Il candidato ideale sarà inserito nel team.' })
    expect(fixesFor(f, issue('gender_masculine_phrasing', 'summary', 'Il candidato ideale'))[0]?.patch).toEqual({ summary: 'La persona ideale sarà inserito nel team.' })
    expect(fixesFor(f, issue('gender_masculine_phrasing', 'summary', 'sarà inserito'))[0]?.patch).toEqual({ summary: 'Il candidato ideale sarà inserito/a nel team.' })
    expect(fixesFor(form({ summary: 'Cerchiamo uno sviluppatore' }), issue('gender_masculine_phrasing', 'summary', 'Cerchiamo uno sviluppatore'))).toEqual([])
  })

  it('writes the legal wording for protected categories', () => {
    const f = form({ benefits: ['Aperto a categorie protette'] })
    const [fix] = fixesFor(f, issue('protected_categories_wording', 'benefits.0', 'categorie protette'))
    expect(fix?.patch).toEqual({ benefits: ['Aperto a iscritti alle liste del collocamento mirato ai sensi della L. 68/99'] })
  })

  it('offers nothing when the text changed and no longer holds the match', () => {
    expect(fixesFor(form({ summary: 'Nuovo testo' }), issue('discriminatory_requirement', 'summary', 'bella presenza'))).toEqual([])
    expect(fixesFor(form(), issue('discriminatory_requirement', 'salary.min', 'x'))).toEqual([])
  })
})
