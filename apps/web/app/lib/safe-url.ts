import { httpUrlOrNull } from '@candydati/domain'

/** Only an http(s) address becomes a link: stored data can hold anything (`javascript:` is script on our origin). */
export const safeExternalUrl = (url: string | null | undefined): string | null => httpUrlOrNull(url)

/** Same rule for an image address that comes from data (an organization logo): https only. */
export const safeImageUrl = (url: string | null | undefined): string | null => httpUrlOrNull(url, { httpsOnly: true })
