<script setup lang="ts">
import type { PublicJobPage } from '@candydati/domain'
import { ExternalLinkIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { safeExternalUrl, safeLogoUrl } from '@/lib/safe-url'

/**
 * Who an agency's ad is for: the client by name (with its website) next to the agency that publishes it, or "confidential
 * client" with the agency running the selection. Never another name. The agency's authorization reference in small print.
 */
type JobClient = NonNullable<PublicJobPage['job']['client']>
defineProps<{ client: JobClient; agency: string; x: Translate }>()
</script>

<template>
  <section class="grid gap-1.5 rounded-xl border-2 border-ink bg-card px-4 py-3.5 sm:px-5" data-testid="public-job-client" :data-display="client.display">
    <template v-if="client.display === 'named' && client.name">
      <p class="flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold">
        <img v-if="safeLogoUrl(client.logo)" :src="safeLogoUrl(client.logo) ?? undefined" alt="" width="32" height="32" class="size-8 rounded-md border bg-card object-contain" loading="lazy" referrerpolicy="no-referrer" />
        <span>{{ x('careers.client.for', { client: client.name }) }}</span>
        <a v-if="safeExternalUrl(client.website)" :href="safeExternalUrl(client.website) ?? undefined" target="_blank" rel="noopener noreferrer nofollow" class="inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="public-job-client-website">
          {{ x('careers.client.website') }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
        </a>
      </p>
      <p class="text-sm text-muted-foreground">{{ x('careers.client.publishedBy', { agency }) }}</p>
    </template>
    <p v-else class="text-base font-semibold">{{ x('careers.client.confidentialBy', { agency }) }}</p>
    <p v-if="client.agencyAuthorization" class="text-xs text-muted-foreground" data-testid="public-job-client-authorization">{{ x('careers.client.authorization', { reference: client.agencyAuthorization }) }}</p>
  </section>
</template>
