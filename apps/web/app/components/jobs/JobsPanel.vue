<script setup lang="ts">
import type { JobSummaryDto } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { pageCount } from '@/lib/audit-api'
import { can } from '@/lib/permissions-ui'
import { staleDaysById } from '@/lib/stale-jobs-api'

const { t } = useI18n()
const { viewer } = useViewer()
const { status, page, clientId, jobs, meta, errorKey, loading, refresh, setStatus, setClient, goTo } = useJobList()
// Agencies filter by client; nothing about clients shows for an organization that does not recruit for them.
const { recruitsForClients } = useAgencySetting()
const clientStore = useClients(recruitsForClients)
const clientFilter = computed({ get: () => clientId.value, set: (next: string | null) => setClient(next) })
const { counts } = useJobCounts()
const pages = computed(() => (meta.value ? pageCount(meta.value) : 1))
const role = computed(() => viewer.value?.role ?? null)
// Fetched once per page load: the list opens on "all", so the badge needs no second request when the filter changes.
const stale = useStaleJobs(computed(() => can(role.value, 'job:read')))
const staleDays = computed(() => staleDaysById(stale.jobs.value))
/** Days idle for a stale published ad, else null: a draft or a closed ad never carries the badge. */
const staleDaysOf = (job: JobSummaryDto): number | null => (job.status === 'published' ? (staleDays.value.get(job.id) ?? null) : null)
// One "now" for server and browser (carried by the payload), so relative times agree on hydration.
const nowMs = useState('jobs-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const showFilter = computed(() => counts.value === null || counts.value.total > 0 || status.value !== null)
</script>

<template>
  <div class="grid gap-4">
    <JobStatusFilter v-if="showFilter" :status="status" :counts="counts" @update:status="setStatus" />
    <ClientFilterSelect v-if="recruitsForClients && clientStore.clients.value.length > 0" id="jobs-client" v-model="clientFilter" :clients="clientStore.clients.value" :label="t('job.list.clientFilter')" test-id="jobs-client-filter" />
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <template v-else>
      <JobListSkeleton v-if="loading && jobs.length === 0" />
      <div v-else :class="loading ? 'opacity-60 transition-opacity' : ''" :aria-busy="loading">
        <JobListEmpty v-if="jobs.length === 0" :status="status" :can-create="can(role, 'job:create')" :can-use-templates="can(role, 'job_template:read')" @show-all="setStatus(null)" />
        <ul v-else class="divide-y overflow-hidden rounded-xl panel">
          <JobListItem v-for="job in jobs" :key="job.id" :job="job" :now="now" :stale="staleDaysOf(job) !== null" :stale-days="staleDaysOf(job) ?? 0" :show-client="recruitsForClients" />
        </ul>
      </div>
      <PaginationBar v-if="meta && meta.total > 0" :page="page" :pages="pages" :total="meta.total" :disabled="loading" status-key="job.list.pagination.status" @update:page="goTo" />
    </template>
  </div>
</template>
