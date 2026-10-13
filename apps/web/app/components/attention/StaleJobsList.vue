<script setup lang="ts">
import { toast } from 'vue-sonner'
import { openApplicationsOf } from '@/lib/attention-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { formatDate } from '@/lib/format'
import { closeJob } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'
import { STALE_JOB_DAYS, type StaleJobDto } from '@/lib/phase9-contract'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * "Annunci fermi": published ads with no activity for `STALE_JOB_DAYS` days. Never closed by itself: closing goes
 * through the same confirmation as the editor (open applications are decided or reviewed first).
 */
defineProps<{ jobs: readonly StaleJobDto[]; loading: boolean; errorKey: string | null }>()
const emit = defineEmits<{ reload: [] }>()
const { t, locale } = useI18n()
const request = useJobsApi()
const { viewer } = useViewer()
const canClose = computed(() => can(viewer.value?.role ?? null, 'job:close'))

const target = ref<StaleJobDto | null>(null)
const closeOpen = ref(false)
const closing = ref(false)
const closeErrorKey = ref<string | null>(null)
const blocked = ref<number | null>(null)

const choose = (job: StaleJobDto): void => {
  target.value = job
  closeErrorKey.value = null
  blocked.value = null
  closeOpen.value = true
}
const confirmClose = async (): Promise<void> => {
  const job = target.value
  if (!job) return
  closing.value = true
  closeErrorKey.value = null
  blocked.value = null
  try {
    await closeJob(request, job.id)
    toast.success(t('job.actions.closed'))
    closeOpen.value = false
    target.value = null
    emit('reload')
  } catch (error) {
    // Open applications: the close flow stays open and offers to decide or review them; anything else is shown there.
    const open = openApplicationsOf(error)
    if (open === null) closeErrorKey.value = errorKeyOf(error)
    else blocked.value = open
  } finally {
    closing.value = false
  }
}
</script>

<template>
  <div class="grid gap-4">
    <p class="text-sm text-muted-foreground">{{ t('attention.stale.hint', { days: STALE_JOB_DAYS }) }}</p>
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="emit('reload')">{{ t('common.retry') }}</Button></div>
    </div>
    <ul v-else-if="loading && jobs.length === 0" class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-busy="true">
      <li v-for="n in 3" :key="n" class="flex items-center gap-3 px-5 py-4 sm:px-6">
        <div class="grid flex-1 gap-2"><Skeleton class="h-4 w-2/5" /><Skeleton class="h-3 w-1/4" /></div>
      </li>
    </ul>
    <p v-else-if="jobs.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="attention-stale-empty">
      {{ t('attention.stale.empty', { days: STALE_JOB_DAYS }) }}
    </p>
    <ul v-else :class="['divide-y overflow-hidden rounded-xl border bg-card shadow-xs', loading ? 'opacity-60 transition-opacity' : '']" :aria-label="t('attention.stale.list')" :aria-busy="loading">
      <li
        v-for="job in jobs"
        :key="job.id"
        class="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
        data-testid="attention-stale-row"
        :data-job-id="job.id"
      >
        <div class="grid min-w-0 gap-0.5">
          <h3 class="text-[0.9375rem] font-medium leading-snug">
            <NuxtLink :to="`/app/jobs/${encodeURIComponent(job.id)}`" class="block truncate hover:underline" data-testid="attention-stale-title">{{ job.title }}</NuxtLink>
          </h3>
          <p class="text-sm font-medium tabular-nums" data-testid="attention-stale-idle">{{ t('attention.stale.noActivity', { count: job.daysSinceActivity }) }}</p>
          <p class="text-xs text-muted-foreground">
            <span v-if="job.publishedAt">{{ t('attention.stale.published', { date: formatDate(job.publishedAt, locale) }) }} · </span>
            <span class="tabular-nums">{{ t('attention.stale.openApplications', { count: job.openApplications }, job.openApplications) }}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 md:justify-end">
          <Button as-child variant="outline" size="sm"><NuxtLink :to="`/app/jobs/${encodeURIComponent(job.id)}`" data-testid="attention-stale-open">{{ t('attention.stale.open') }}</NuxtLink></Button>
          <Button v-if="canClose" type="button" variant="outline" size="sm" data-testid="attention-stale-close" @click="choose(job)">{{ t('attention.stale.close') }}</Button>
        </div>
      </li>
    </ul>
    <CloseJobFlow
      v-if="target"
      :key="target.id"
      v-model:open="closeOpen"
      :job-id="target.id"
      :closing="closing"
      :error-key="closeErrorKey"
      :blocked="blocked"
      @close-job="confirmClose"
    />
  </div>
</template>
