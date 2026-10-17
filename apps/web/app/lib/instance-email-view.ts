import { instanceEmailSettingsInputSchema, type InstanceEmailSettingsDto, type InstanceEmailSettingsInput } from '@candydati/domain'

export type InstanceEmailProvider = 'smtp' | 'resend'
export type InstanceEmailState = 'environment' | 'ready' | 'none'

/** What the form holds: text as typed (the port too), secrets empty unless the person types a new one. */
export interface InstanceEmailForm {
  readonly provider: InstanceEmailProvider
  readonly host: string
  readonly port: string
  readonly secure: boolean
  readonly user: string
  readonly password: string
  readonly apiKey: string
  readonly sendingDomain: string
  readonly fromLocal: string
}

export type InstanceEmailField = 'host' | 'port' | 'user' | 'password' | 'apiKey' | 'sendingDomain' | 'fromLocal'
export type InstanceEmailErrors = Partial<Record<InstanceEmailField, string>>
export type InstanceEmailInputResult = { readonly ok: true; readonly input: InstanceEmailSettingsInput } | { readonly ok: false; readonly errors: InstanceEmailErrors }

const DEFAULT_PORT = '587'
const IMPLICIT_TLS_PORT = '465'
const DEFAULT_LOCAL = 'noreply'

export const emptyInstanceEmailForm: InstanceEmailForm = {
  provider: 'smtp',
  host: '',
  port: DEFAULT_PORT,
  secure: false,
  user: '',
  password: '',
  apiKey: '',
  sendingDomain: '',
  fromLocal: DEFAULT_LOCAL,
}

/** Pure: set by the server, working, or still to configure. */
export const instanceEmailState = (settings: InstanceEmailSettingsDto): InstanceEmailState => {
  if (settings.source === 'environment') return 'environment'
  return settings.ready ? 'ready' : 'none'
}

/** Pure: the form for the stored settings. Secrets are never sent to the browser, so they start empty. */
export const formFromSettings = (settings: InstanceEmailSettingsDto): InstanceEmailForm => ({
  ...emptyInstanceEmailForm,
  provider: settings.provider ?? 'smtp',
  ...(settings.smtp ? { host: settings.smtp.host, port: String(settings.smtp.port), secure: settings.smtp.secure, user: settings.smtp.user } : {}),
  sendingDomain: settings.sendingDomain ?? '',
  fromLocal: settings.fromLocal || DEFAULT_LOCAL,
})

/** Pure: a new port; 465 speaks TLS from the first byte, so the switch follows it in and out of 465. */
export const withPort = (form: InstanceEmailForm, port: string): InstanceEmailForm => {
  const trimmed = port.trim()
  if (trimmed === IMPLICIT_TLS_PORT) return { ...form, port, secure: true }
  if (form.port.trim() === IMPLICIT_TLS_PORT) return { ...form, port, secure: false }
  return { ...form, port }
}

/** Pure: the From address people will see, or null while the domain is empty. */
export const fromPreview = (form: InstanceEmailForm): string | null => {
  const domain = form.sendingDomain.trim().toLowerCase()
  if (!domain) return null
  return `${form.fromLocal.trim() || DEFAULT_LOCAL}@${domain}`
}

const PORT = /^\d{1,5}$/
const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value)

const draftOf = (form: InstanceEmailForm): unknown => {
  const common = { sendingDomain: form.sendingDomain, fromLocal: form.fromLocal.trim() || DEFAULT_LOCAL }
  if (form.provider === 'resend') return { provider: 'resend', resend: { ...(optional(form.apiKey) ? { apiKey: form.apiKey.trim() } : {}) }, ...common }
  const user = optional(form.user)?.trim()
  const smtp = {
    host: form.host,
    port: PORT.test(form.port.trim()) ? Number(form.port.trim()) : Number.NaN,
    secure: form.secure,
    ...(user ? { user } : {}),
    ...(optional(form.password) ? { password: form.password } : {}),
  }
  return { provider: 'smtp', smtp, ...common }
}

/** The form field an issue of the input schema belongs to (`smtp.host` -> `host`). */
const fieldOf = (path: readonly PropertyKey[]): InstanceEmailField | null => {
  const last = String(path.at(-1) ?? '')
  const known: readonly InstanceEmailField[] = ['host', 'port', 'user', 'password', 'apiKey', 'sendingDomain', 'fromLocal']
  return (known as readonly string[]).includes(last) ? (last as InstanceEmailField) : null
}

/** Pure: the input for the api, validated with the same schema; or the message of each invalid field. */
export const instanceEmailInput = (form: InstanceEmailForm): InstanceEmailInputResult => {
  const parsed = instanceEmailSettingsInputSchema.safeParse(draftOf(form))
  if (parsed.success) return { ok: true, input: parsed.data }
  const errors = parsed.error.issues.reduce<InstanceEmailErrors>((acc, issue) => {
    const field = fieldOf(issue.path)
    return field && !(field in acc) ? { ...acc, [field]: `instanceEmail.errors.${field}` } : acc
  }, {})
  return { ok: false, errors }
}

/** Pure: what to check when the provider refused the test email. */
export const testFailureHintKey = (provider: InstanceEmailProvider): string => (provider === 'resend' ? 'instanceEmail.test.hintResend' : 'instanceEmail.test.hintSmtp')
