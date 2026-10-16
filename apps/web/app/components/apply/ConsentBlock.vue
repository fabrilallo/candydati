<script setup lang="ts">
import type { PublicPrivacyNoticeDto } from '@candydati/domain'
import { ChevronRightIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { retentionCopy } from '@/lib/consent-copy'

/**
 * The privacy notice and the two separate consents (PRODUCT.md §6): selection, required; talent pool, optional. How long
 * the data is kept is said in plain words next to each choice.
 */
const props = defineProps<{ notice: PublicPrivacyNoticeDto; organization: string; selection: boolean; talentPool: boolean; error?: string | undefined; x: Translate }>()
const emit = defineEmits<{ 'update:selection': [value: boolean]; 'update:talentPool': [value: boolean] }>()
const periods = computed(() => retentionCopy(props.notice.retentionDays, props.x))
const boxClass = 'mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden'
</script>

<template>
  <fieldset class="grid gap-4 rounded-xl border bg-card px-4 py-5 sm:px-5" data-testid="consent-block">
    <legend class="sr-only">{{ x('apply.consent.legend') }}</legend>
    <div class="grid gap-1">
      <p class="text-[0.9375rem] font-semibold">{{ x('apply.consent.title') }}</p>
      <p class="text-sm text-muted-foreground">{{ x('apply.consent.summary', { organization }) }}</p>
    </div>

    <details class="group rounded-lg border bg-background" data-testid="privacy-notice">
      <summary class="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-snap group-open:rotate-90" aria-hidden="true" />
        {{ x('apply.consent.read') }}
        <span class="figure ml-auto shrink-0 whitespace-nowrap text-xs font-normal text-muted-foreground">{{ x('apply.consent.version', { version: notice.version }) }}</span>
      </summary>
      <div class="max-h-80 overflow-y-auto border-t px-3.5 py-3" :lang="notice.language" tabindex="0" :aria-label="x('apply.consent.read')">
        <PrivacyText :text="notice.text" />
      </div>
    </details>

    <p class="text-sm text-muted-foreground">
      {{ x('apply.consent.rights') }}
      <a :href="`mailto:${notice.contactEmail}`" class="font-medium break-all text-primary underline-offset-4 hover:underline" data-testid="privacy-contact">{{ notice.contactEmail }}</a>
    </p>

    <div class="grid gap-3 border-t pt-4">
      <label class="flex items-start gap-3" for="consent-selection">
        <input
          id="consent-selection"
          type="checkbox"
          :class="boxClass"
          :checked="selection"
          required
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'consent-selection-error' : 'consent-selection-hint'"
          data-testid="consent-selection"
          @change="emit('update:selection', ($event.target as HTMLInputElement).checked)"
        />
        <span class="grid gap-0.5">
          <span class="text-sm font-medium">{{ x('apply.consent.selection') }} <span class="font-normal text-muted-foreground">{{ x('apply.consent.required') }}</span></span>
          <span id="consent-selection-hint" class="text-xs text-muted-foreground">{{ x('apply.consent.selectionHint', { period: periods.selection }) }}</span>
        </span>
      </label>
      <p v-if="error" id="consent-selection-error" class="pl-7 text-xs font-medium text-destructive" data-testid="field-error">{{ error }}</p>
      <label class="flex items-start gap-3" for="consent-pool">
        <input
          id="consent-pool"
          type="checkbox"
          :class="boxClass"
          :checked="talentPool"
          aria-describedby="consent-pool-hint"
          data-testid="consent-pool"
          @change="emit('update:talentPool', ($event.target as HTMLInputElement).checked)"
        />
        <span class="grid gap-0.5">
          <span class="text-sm font-medium">{{ x('apply.consent.pool') }} <span class="font-normal text-muted-foreground">{{ x('apply.consent.optional') }}</span></span>
          <span id="consent-pool-hint" class="text-xs text-muted-foreground">{{ x('apply.consent.poolHint', { period: periods.talentPool, organization }) }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
