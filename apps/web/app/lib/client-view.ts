import { clientInputSchema, type ClientDto, type ClientInput } from '@candydati/domain'
import { ApiFailure } from './api-call'
import { errorKeyOf } from './auth-errors'

/** The client form of the settings page: plain strings while typing, the domain schema decides when saving. */
export interface ContactForm {
  /** Stable key of the row (the contact id when it exists). */
  readonly key: string
  readonly id: string | null
  readonly name: string
  readonly email: string
}

export interface ClientForm {
  readonly name: string
  readonly website: string
  readonly logoUrl: string
  readonly contacts: readonly ContactForm[]
}

/** Field id (as in the form) to translation key. */
export type ClientFormErrors = Readonly<Record<string, string>>

export const emptyClientForm = (): ClientForm => ({ name: '', website: '', logoUrl: '', contacts: [] })

export const clientFormOf = (client: ClientDto): ClientForm => ({
  name: client.name,
  website: client.website ?? '',
  logoUrl: client.logoUrl ?? '',
  contacts: client.contacts.map((contact) => ({ key: contact.id, id: contact.id, name: contact.name, email: contact.email })),
})

export const addContact = (form: ClientForm, key: string): ClientForm => ({ ...form, contacts: [...form.contacts, { key, id: null, name: '', email: '' }] })

export const removeContact = (form: ClientForm, key: string): ClientForm => ({ ...form, contacts: form.contacts.filter((contact) => contact.key !== key) })

export const patchContact = (form: ClientForm, key: string, patch: Partial<Pick<ContactForm, 'name' | 'email'>>): ClientForm => ({
  ...form,
  contacts: form.contacts.map((contact) => (contact.key === key ? { ...contact, ...patch } : contact)),
})

const toInput = (form: ClientForm): ClientInput => ({
  name: form.name,
  website: form.website.trim() === '' ? null : form.website.trim(),
  logoUrl: form.logoUrl.trim() === '' ? null : form.logoUrl.trim(),
  contacts: form.contacts.map((contact) => ({ ...(contact.id ? { id: contact.id } : {}), name: contact.name, email: contact.email.trim() })),
})

const FIELD_KEYS: Readonly<Record<string, string>> = {
  name: 'clients.form.errors.name',
  website: 'clients.form.errors.website',
  logoUrl: 'clients.form.errors.logoUrl',
  contacts: 'clients.form.errors.duplicateContact',
}

/** Pure: issues (dotted paths, as zod and the api give them) placed on the fields of the form. Unknown paths are left out. */
export const clientIssueErrors = (form: ClientForm, issues: readonly { readonly path: string; readonly message?: string }[]): ClientFormErrors =>
  issues.reduce<ClientFormErrors>((errors, issue) => {
    const [head, index, field] = issue.path.split('.')
    if (head === 'contacts' && index !== undefined && (field === 'name' || field === 'email')) {
      const contact = form.contacts[Number(index)]
      if (!contact) return errors
      return { ...errors, [`contact-${contact.key}-${field}`]: field === 'name' ? 'clients.form.errors.contactName' : 'clients.form.errors.contactEmail' }
    }
    const key = head && index === undefined ? FIELD_KEYS[head] : undefined
    return key ? { ...errors, [head as string]: key } : errors
  }, {})

export type ClientFormCheck = { readonly ok: true; readonly input: ClientInput } | { readonly ok: false; readonly errors: ClientFormErrors }

/** Pure: the input to send, or the errors to show, checked with the same schema as the api. */
export const checkClientForm = (form: ClientForm): ClientFormCheck => {
  const input = toInput(form)
  const parsed = clientInputSchema.safeParse(input)
  if (parsed.success) return { ok: true, input }
  return { ok: false, errors: clientIssueErrors(form, parsed.error.issues.map((issue) => ({ path: issue.path.join('.') }))) }
}

/** Pure: the message for a refused save, with the two refusals specific to clients. */
export const clientErrorKey = (error: unknown): string => {
  if (error instanceof ApiFailure) {
    if (error.failure.code === 'clients_off') return 'clients.errors.off'
    if (error.failure.status === 409) return 'clients.errors.duplicate'
  }
  return errorKeyOf(error)
}
