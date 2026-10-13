<script setup lang="ts">
import { CircleCheckIcon, CircleDashedIcon } from '@lucide/vue'
import type { PublishIssue } from '@tt/domain'
import { focusField } from '@/lib/focus-field'
import { describeIssues } from '@/lib/job-issues'

const props = defineProps<{ issues: readonly PublishIssue[] }>()
const { t } = useI18n()
const views = computed(() => describeIssues(props.issues))
</script>

<template>
  <section aria-labelledby="checklist-title" class="grid gap-3 rounded-xl border bg-card p-4" data-testid="publish-checklist">
    <div class="flex items-center justify-between gap-2">
      <h2 id="checklist-title" class="text-sm font-semibold">{{ t('job.checklist.title') }}</h2>
      <span v-if="views.length" class="text-xs text-muted-foreground" aria-live="polite">{{ t('job.checklist.missing', { count: views.length }, views.length) }}</span>
    </div>
    <p v-if="!views.length" class="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400" data-testid="checklist-ready">
      <CircleCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ t('job.checklist.ready') }}
    </p>
    <ul v-else class="grid gap-2">
      <li v-for="view in views" :key="`${view.path}-${view.rule}`" class="flex items-start gap-2 text-sm" data-testid="checklist-issue">
        <CircleDashedIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <a :href="`#${view.fieldId}`" class="font-medium underline underline-offset-4" @click.prevent="focusField(view.fieldId)">{{ t(view.labelKey) }}</a>
          <span class="text-muted-foreground"> · {{ t(view.messageKey) }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
