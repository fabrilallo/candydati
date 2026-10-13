<script setup lang="ts">
import { ShieldAlertIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/**
 * Reminder for admins while the organization has no privacy notice: without it no ad can be published and no
 * application received. Dismissed for the session only.
 */
const { t } = useI18n()
const { missing } = useActivePrivacyNotice()
const dismissed = useState('privacy-banner-dismissed', () => false)
</script>

<template>
  <section v-if="missing && !dismissed" class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4" aria-labelledby="privacy-banner-title" data-testid="privacy-banner">
    <ShieldAlertIcon class="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
    <div class="grid min-w-0 flex-1 gap-1">
      <h2 id="privacy-banner-title" class="text-[0.9375rem] font-semibold text-foreground">{{ t('privacy.banner.title') }}</h2>
      <p class="text-sm text-foreground">{{ t('privacy.banner.body') }}</p>
      <div class="pt-1">
        <Button as-child size="sm" variant="outline"><NuxtLink to="/app/settings/privacy" data-testid="privacy-banner-link">{{ t('privacy.banner.action') }}</NuxtLink></Button>
      </div>
    </div>
    <button type="button" class="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden" :aria-label="t('privacy.banner.dismiss')" data-testid="privacy-banner-dismiss" @click="dismissed = true">
      <XIcon class="size-4" aria-hidden="true" />
    </button>
  </section>
</template>
