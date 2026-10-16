import { loadPlatformConfig, type PlatformConfig } from '@candydati/domain'

export interface PublicPlatformConfig {
  readonly platformName?: string | undefined
  readonly platformDefaultLocale?: string | undefined
  readonly siteUrl?: string | undefined
}

/** Pure: `runtimeConfig.public` (fed by NUXT_PUBLIC_PLATFORM_*) to the shared, frozen platform config. */
export const platformFromPublicConfig = (pub: PublicPlatformConfig): PlatformConfig =>
  Object.freeze(
    loadPlatformConfig({
      PLATFORM_NAME: pub.platformName,
      PLATFORM_DEFAULT_LOCALE: pub.platformDefaultLocale,
      PLATFORM_URL: pub.siteUrl,
    }),
  )
