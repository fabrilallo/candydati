import { ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL } from '@candydati/domain'
import { channelLabel } from './tracked-link'

type Translate = (key: string, params?: Record<string, unknown>) => string

const NAMED: readonly string[] = [ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL]

/** True for the origins the system gives (direct, import, manual): shown as words, not as a channel name. */
export const isNamedOrigin = (origin: string): boolean => NAMED.includes(origin)

/** How a source is named on screen: the system origins as in the reports, a preset channel by its name, any other as stored. */
export const originLabel = (origin: string, t: Translate): string => (isNamedOrigin(origin) ? t(`reports.sources.named.${origin}`) : channelLabel(origin, t))

/** "LinkedIn, campagna autunno-2026", or the source alone when there is no campaign. */
export const originText = (origin: string, campaign: string | null, t: Translate): string =>
  campaign ? t('origin.withCampaign', { source: originLabel(origin, t), campaign }) : originLabel(origin, t)
