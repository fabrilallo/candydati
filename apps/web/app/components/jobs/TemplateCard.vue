<script setup lang="ts">
import type { JobTemplateDto } from '@candydati/domain'
import { Trash2Icon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Params } from '@/lib/ad-text'
import { relativeTime } from '@/lib/job-list-view'
import { templateSummary } from '@/lib/template-summary'

const props = defineProps<{ template: JobTemplateDto; now: Date; canCreate: boolean; canDelete: boolean }>()
defineEmits<{ remove: [template: JobTemplateDto] }>()
const { t, locale } = useI18n()
const tr = (key: string, params: Params = {}): string => (typeof params.count === 'number' ? t(key, params, { plural: params.count }) : t(key, params))
const summary = computed(() => templateSummary(props.template.content, tr))
const updated = computed(() => relativeTime(props.template.updatedAt, props.now, locale.value))
</script>

<template>
  <li class="grid content-between gap-5 rounded-xl border bg-card p-5 shadow-xs transition-colors duration-150 ease-snap hover:border-foreground/20" data-testid="template-row">
    <div class="grid gap-2">
      <div class="flex items-start justify-between gap-3">
        <h3 class="min-w-0 text-[0.9375rem] font-medium leading-snug">{{ template.name }}</h3>
        <Badge variant="secondary">{{ template.content.role ? t(`taxonomy.roles.${template.content.role}`) : t('job.list.noRole') }}</Badge>
      </div>
      <p class="text-sm text-muted-foreground" data-testid="template-summary">{{ summary }}</p>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <p class="text-xs text-muted-foreground">
        <time :datetime="template.updatedAt">{{ t('job.list.updatedAgo', { time: updated }) }}</time>
      </p>
      <div class="flex items-center gap-1.5">
        <Button v-if="canDelete" type="button" variant="ghost" size="sm" :aria-label="t('job.templates.deleteFor', { name: template.name })" data-testid="delete-template" @click="$emit('remove', template)">
          <Trash2Icon aria-hidden="true" />
          {{ t('job.templates.delete') }}
        </Button>
        <Button v-if="canCreate" as-child size="sm" :aria-label="t('job.templates.useFor', { name: template.name })">
          <NuxtLink :to="{ path: '/app/jobs/new', query: { template: template.id } }" rel="nofollow">{{ t('job.templates.use') }}</NuxtLink>
        </Button>
      </div>
    </div>
  </li>
</template>
