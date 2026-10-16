import type { EmailSettingsDto, DomainStatus  } from '@candydati/domain'
import { z } from 'zod'
import type { EmailSettingsInput } from './message-api'

export type SettingsTone = 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'

export interface DomainStatusView {
  readonly state: DomainStatus | 'default'
  readonly tone: SettingsTone
  readonly key: string
  /** Only a verified domain is used as From. */
  readonly usesOwnAddress: boolean
  /** The DNS records still have to be published (or fixed). */
  readonly showRecords: boolean
  /** "Verifica di nuovo" makes sense: the provider can check this domain. */
  readonly canVerify: boolean
}

const TONES: Readonly<Record<DomainStatus, SettingsTone>> = { verified: 'success', pending: 'warning', failed: 'destructive', unsupported: 'secondary' }

/** Pure: the status pill and what the page offers for the own domain. */
export const domainStatusView = (settings: EmailSettingsDto): DomainStatusView => {
  const status = settings.domain?.status ?? null
  if (status === null) return { state: 'default', tone: 'outline', key: 'emailSettings.status.default', usesOwnAddress: false, showRecords: false, canVerify: false }
  return {
    state: status,
    tone: TONES[status],
    key: `emailSettings.status.${status}`,
    usesOwnAddress: status === 'verified',
    showRecords: status === 'pending' || status === 'failed',
    canVerify: status !== 'unsupported',
  }
}

export interface EmailSettingsForm {
  readonly senderName: string
  readonly fromAddress: string
}

export const SENDER_NAME_MAX = 80
const addressSchema = z.email()

/** Pure: field errors as translation keys; an empty object when the form can be saved. */
export const validateEmailSettings = (form: EmailSettingsForm): Partial<Record<keyof EmailSettingsForm, string>> => {
  const name = form.senderName.trim()
  const address = form.fromAddress.trim()
  return {
    ...(name === '' || name.length > SENDER_NAME_MAX ? { senderName: 'emailSettings.errors.senderName' } : {}),
    ...(address !== '' && !addressSchema.safeParse(address).success ? { fromAddress: 'emailSettings.errors.fromAddress' } : {}),
  }
}

/** Pure: the PUT body. No address means the default sending identity. */
export const emailSettingsInput = (form: EmailSettingsForm): EmailSettingsInput => {
  const address = form.fromAddress.trim().toLowerCase()
  return { senderName: form.senderName.trim(), fromAddress: address === '' ? null : address }
}
