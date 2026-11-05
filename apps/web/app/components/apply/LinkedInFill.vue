<script setup lang="ts">
import { InfoIcon } from '@lucide/vue'
import { linkedInStartPath } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'
import { Button } from '@/components/ui/button'

/**
 * "Fill in with LinkedIn": a plain link (it works as a navigation, not a script), the promise of what is read next to
 * it, and the outcome once the candidate is back. A neutral text button: no LinkedIn logo is reproduced.
 */
defineProps<{ org: string; job: string; enabled: boolean; noticeKey: string | null; x: Translate }>()
</script>

<template>
  <div v-if="enabled || noticeKey" class="grid gap-3" data-testid="linkedin-prefill">
    <p v-if="noticeKey" class="flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-sm" role="status" data-testid="linkedin-notice">
      <InfoIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ x(noticeKey) }}
    </p>
    <div v-if="enabled" class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button as-child variant="outline">
        <a :href="linkedInStartPath(org, job)" rel="nofollow" aria-describedby="apply-linkedin-hint" data-testid="linkedin-start">{{ x('apply.linkedin.button') }}</a>
      </Button>
      <p id="apply-linkedin-hint" class="max-w-md text-xs text-muted-foreground">{{ x('apply.linkedin.hint') }}</p>
    </div>
  </div>
</template>
