<script setup lang="ts">
import type { JobStatus } from '@tt/domain'
import { FilePlusIcon, FileTextIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ status: JobStatus | null; canCreate: boolean; canUseTemplates: boolean }>()
defineEmits<{ showAll: [] }>()
const { t } = useI18n()
const copyKey = computed(() => (props.status === null ? 'job.list.empty' : `job.list.empty.${props.status}`))
const title = computed(() => (props.status === null ? t('job.list.emptyTitle') : t(`${copyKey.value}.title`)))
const body = computed(() => (props.status === null ? t('job.list.emptyBody') : t(`${copyKey.value}.body`)))
const starts = computed(() => props.status === null || props.status === 'draft')
</script>

<template>
  <section class="grid gap-5 rounded-xl border bg-card px-6 py-10 shadow-xs sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:px-8" data-testid="jobs-empty">
    <span class="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><FilePlusIcon class="size-5" /></span>
    <div class="grid max-w-xl gap-4">
      <div class="grid gap-1.5">
        <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
        <p class="text-[0.9375rem] text-muted-foreground">{{ body }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="starts">
          <Button v-if="canCreate" as-child>
            <NuxtLink to="/app/jobs/new"><FilePlusIcon aria-hidden="true" />{{ t('job.list.newBlank') }}</NuxtLink>
          </Button>
          <Button v-if="canUseTemplates" as-child variant="outline">
            <NuxtLink to="/app/jobs/templates"><FileTextIcon aria-hidden="true" />{{ t('job.list.newFromTemplate') }}</NuxtLink>
          </Button>
        </template>
        <Button v-else type="button" variant="outline" data-testid="show-all" @click="$emit('showAll')">{{ t('job.list.showAll') }}</Button>
      </div>
    </div>
  </section>
</template>
