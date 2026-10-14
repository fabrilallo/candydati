<script setup lang="ts">
import type { CandidateCorrection } from '@tt/domain'
import { InfoIcon } from '@lucide/vue'
import type { ContactChange } from '@/lib/submitted-contact'
import { correctionOf } from '@/lib/submitted-contact'
import { Button } from '@/components/ui/button'

/** Data typed on a public application that differs from the profile: shown for review, applied only by a recruiter. */
const props = defineProps<{ changes: readonly ContactChange[]; canApply: boolean; busy: boolean }>()
const emit = defineEmits<{ apply: [correction: CandidateCorrection] }>()
const { t } = useI18n()
</script>

<template>
  <section v-if="changes.length > 0" class="grid gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4" data-testid="submitted-contact">
    <h3 class="flex items-center gap-2 text-[0.9375rem] font-medium"><InfoIcon class="size-4" aria-hidden="true" />{{ t('candidate.submitted.title') }}</h3>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('candidate.submitted.body') }}</p>
    <ul class="grid gap-1 text-sm">
      <li v-for="change in changes" :key="change.field" class="flex flex-wrap gap-x-2">
        <span class="text-muted-foreground">{{ t(`gdpr.correct.fields.${change.field === 'linkedinUrl' ? 'linkedin' : change.field}`) }}</span>
        <span class="break-all">{{ change.current ?? t('candidate.fields.notGiven') }}</span>
        <span aria-hidden="true">→</span>
        <span class="break-all font-medium">{{ change.submitted }}</span>
      </li>
    </ul>
    <Button v-if="canApply" size="sm" variant="outline" class="justify-self-start" :disabled="busy" data-testid="submitted-contact-apply" @click="emit('apply', correctionOf(props.changes))">{{ t('candidate.submitted.apply') }}</Button>
  </section>
</template>
