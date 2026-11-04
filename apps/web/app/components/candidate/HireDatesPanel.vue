<script setup lang="ts">
import type { CandidateApplicationDto, HireDatesInput } from '@candydati/domain'
import { CalendarCheckIcon, PencilIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { hireDatesBody, hireDatesProblemKey, hireDraftOf, type HireDraft } from '@/lib/hire-dates'
import { Button } from '@/components/ui/button'

/**
 * The offer accepted and start dates of a hired application (key and value, docs/DESIGN-SYSTEM.md). Anyone who can record
 * outcomes can set or change them; "time to hire" in the reports is measured to the offer date when it is here.
 */
const props = defineProps<{ application: CandidateApplicationDto; canEdit: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [dates: HireDatesInput] }>()
const { t, locale } = useI18n()
const editing = ref(false)
const draft = ref<HireDraft>(hireDraftOf(props.application))
const problem = computed(() => hireDatesProblemKey(props.application.createdAt, draft.value))
const show = (on: string | null): string => (on === null ? t('candidate.hireDates.notSet') : formatDate(`${on}T00:00:00.000Z`, locale.value, 'UTC'))
const edit = (): void => {
  draft.value = hireDraftOf(props.application)
  editing.value = true
}
const save = (): void => {
  emit('save', hireDatesBody(draft.value, true))
  editing.value = false
}
</script>

<template>
  <section class="grid gap-3 rounded-lg border bg-card p-4" data-testid="hire-dates-panel" :aria-label="t('candidate.hireDates.title')">
    <div class="flex items-center justify-between gap-3">
      <h2 class="flex items-center gap-2 text-sm font-semibold"><CalendarCheckIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('candidate.hireDates.title') }}</h2>
      <Button v-if="canEdit && !editing" type="button" variant="outline" size="sm" :disabled="busy" data-testid="hire-dates-edit" @click="edit"><PencilIcon aria-hidden="true" />{{ t('candidate.hireDates.edit') }}</Button>
    </div>
    <template v-if="editing">
      <HireDatesFields v-model="draft" :applied-at="application.createdAt" id-prefix="detail-hire" />
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" :disabled="busy" @click="editing = false">{{ t('job.actions.cancel') }}</Button>
        <Button type="button" size="sm" :disabled="busy || problem !== null" data-testid="hire-dates-save" @click="save">{{ t('candidate.hireDates.save') }}</Button>
      </div>
    </template>
    <dl v-else class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div class="grid gap-0.5">
        <dt class="text-muted-foreground">{{ t('candidate.hireDates.offerAcceptedOn') }}</dt>
        <dd class="figure font-medium" data-testid="hire-offer-value">{{ show(application.offerAcceptedOn) }}</dd>
      </div>
      <div class="grid gap-0.5">
        <dt class="text-muted-foreground">{{ t('candidate.hireDates.startOn') }}</dt>
        <dd class="figure font-medium" data-testid="hire-start-value">{{ show(application.startOn) }}</dd>
      </div>
    </dl>
  </section>
</template>
