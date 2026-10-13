import type { PlatformConfig } from '@tt/domain'
import { platformFromPublicConfig } from '@/lib/platform'

/**
 * The only place that knows the product name (`NUXT_PUBLIC_PLATFORM_NAME`). Memoised per request in `useState`
 * and shared with the browser through the payload, so server and client render the same words.
 */
export const usePlatform = () => useState<PlatformConfig>('platform', () => platformFromPublicConfig(useRuntimeConfig().public))
