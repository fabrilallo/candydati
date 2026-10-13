<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import type { OptionalHint } from '@/lib/ad-gaps'

/** An empty optional section, preview only: quiet, and a shortcut to the field. */
defineProps<{ hint: OptionalHint }>()
const { t, locale } = useI18n()
const ad = useAdContext()
</script>

<template>
  <button
    type="button"
    :lang="locale"
    class="inline-flex w-fit items-start gap-1.5 rounded-sm text-left text-sm text-muted-foreground underline decoration-dashed decoration-border underline-offset-4 transition-colors duration-150 ease-snap hover:text-foreground hover:decoration-foreground/40"
    data-testid="ad-hint"
    :data-hint="hint.key"
    @click="ad.jump(hint.fieldId)"
  >
    <PlusIcon class="mt-[0.1875rem] size-3.5 shrink-0" aria-hidden="true" />
    {{ t(hint.messageKey) }}
  </button>
</template>
