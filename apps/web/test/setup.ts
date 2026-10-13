/** Shared setup for the `nuxt` Vitest project (components and composables). */
import { config } from '@vue/test-utils'

config.global.stubs = { ...config.global.stubs, NuxtLink: false }
