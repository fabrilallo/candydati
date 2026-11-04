import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import { addContact, checkClientForm, clientErrorKey, clientFormOf, clientIssueErrors, emptyClientForm, patchContact, removeContact } from './client-view'

const AT = '2026-10-13T10:00:00.000Z'
const client = { id: 'c1', name: 'Acme', website: 'https://acme.it', logoUrl: null, contacts: [{ id: 'k1', name: 'Rita', email: 'rita@acme.it' }], archived: false, jobCount: 1, createdAt: AT, updatedAt: AT }
const failure = (status: number, code: string | null) => new ApiFailure('x', { status, code, message: null, issues: [] })

describe('client form', () => {
  it('starts empty and fills from a client, keeping contact ids', () => {
    expect(emptyClientForm()).toEqual({ name: '', website: '', logoUrl: '', contacts: [] })
    const form = clientFormOf(client)
    expect(form).toMatchObject({ name: 'Acme', website: 'https://acme.it', logoUrl: '' })
    expect(form.contacts).toEqual([{ key: 'k1', id: 'k1', name: 'Rita', email: 'rita@acme.it' }])
  })

  it('adds, edits and removes contacts without touching the input', () => {
    const start = emptyClientForm()
    const one = addContact(start, 'n1')
    expect(start.contacts).toEqual([])
    const edited = patchContact(one, 'n1', { name: 'Luca' })
    expect(edited.contacts[0]).toEqual({ key: 'n1', id: null, name: 'Luca', email: '' })
    expect(one.contacts[0]?.name).toBe('')
    expect(removeContact(edited, 'n1').contacts).toEqual([])
  })

  it('builds the input: empty addresses become null, kept contacts carry their id', () => {
    const check = checkClientForm(clientFormOf(client))
    expect(check).toEqual({ ok: true, input: { name: 'Acme', website: 'https://acme.it', logoUrl: null, contacts: [{ id: 'k1', name: 'Rita', email: 'rita@acme.it' }] } })
    const fresh = checkClientForm(patchContact(addContact({ ...emptyClientForm(), name: 'Beta' }, 'n1'), 'n1', { name: 'Luca', email: 'luca@beta.it' }))
    expect(fresh).toEqual({ ok: true, input: { name: 'Beta', website: null, logoUrl: null, contacts: [{ name: 'Luca', email: 'luca@beta.it' }] } })
  })

  it('says what is wrong, field by field', () => {
    const form = patchContact(addContact({ name: ' ', website: 'nope', logoUrl: 'http://acme.it/logo.png', contacts: [] }, 'n1'), 'n1', { name: '', email: 'x' })
    const check = checkClientForm(form)
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors).toEqual({
      name: 'clients.form.errors.name',
      website: 'clients.form.errors.website',
      logoUrl: 'clients.form.errors.logoUrl',
      'contact-n1-name': 'clients.form.errors.contactName',
      'contact-n1-email': 'clients.form.errors.contactEmail',
    })
  })

  it('refuses the same email twice', () => {
    const twice = ['a', 'b'].reduce((form, key) => patchContact(addContact(form, key), key, { name: 'X', email: 'x@acme.it' }), { ...emptyClientForm(), name: 'Acme' })
    const check = checkClientForm(twice)
    expect(check.ok ? null : check.errors).toEqual({ contacts: 'clients.form.errors.duplicateContact' })
  })

  it('maps the issues of the api onto the same fields', () => {
    const form = addContact(emptyClientForm(), 'n1')
    expect(clientIssueErrors(form, [{ path: 'contacts.0.email', message: 'Invalid' }, { path: 'name', message: 'x' }, { path: 'other', message: 'x' }])).toEqual({
      'contact-n1-email': 'clients.form.errors.contactEmail',
      name: 'clients.form.errors.name',
    })
  })
})

describe('clientErrorKey', () => {
  it('names the refusals of clients', () => {
    expect(clientErrorKey(failure(409, 'clients_off'))).toBe('clients.errors.off')
    expect(clientErrorKey(failure(409, 'conflict'))).toBe('clients.errors.duplicate')
    expect(clientErrorKey(failure(403, 'forbidden'))).toBe('x')
    expect(clientErrorKey(new Error('boom'))).toBe('errors.generic')
  })
})
