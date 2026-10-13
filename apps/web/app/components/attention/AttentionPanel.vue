<script setup lang="ts">
import type { StageRef, AttentionItemDto  } from '@tt/domain'
import { AlarmClockIcon, HourglassIcon, PartyPopperIcon, TimerIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { pageCount } from '@/lib/audit-api'
import type { AttentionState } from '@/lib/attention-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { moveApplication } from '@/lib/candidate-api'
import { fullName } from '@/lib/candidate-view'
import { can } from '@/lib/permissions-ui'
import { stageName } from '@/lib/pipeline-board'
import type { TabItem } from '@/lib/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * "Da gestire": applications whose promised answer is late or near. A row leaves the list once someone writes,
 * moves or decides; nothing here acts on a candidate without a person choosing it.
 */
const { t } = useI18n()
const request = useJobsApi()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const canSend = computed(() => can(role.value, 'message:send'))
const canMove = computed(() => can(role.value, 'candidate:move'))
const canReadJobs = computed(() => can(role.value, 'job:read'))
/** The tabs of the page: the two answer states, plus the stale ads (their own list, never `useAttention`). */
type AttentionTab = AttentionState | 'stale'
const tab = ref<AttentionTab>('overdue')
const state = ref<AttentionState>('overdue')
const page = ref(1)
watch(tab, (next) => {
  if (next !== 'stale') state.value = next
})
watch(state, () => {
  page.value = 1
})
const list = useAttention(state, page)
const counter = useAttentionCount()
const stale = useStaleJobs(canReadJobs)
const staleWaiting = computed(() => (stale.count.value ?? 0) > 0)
const nowMs = useState('attention-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const tabs = computed<readonly TabItem<AttentionTab>[]>(() => [
  { value: 'overdue', label: t('attention.tabs.overdue'), icon: AlarmClockIcon, count: counter.totals.value?.overdue ?? null, testId: 'attention-tab-overdue' },
  { value: 'due_soon', label: t('attention.tabs.due_soon'), icon: TimerIcon, count: counter.totals.value?.dueSoon ?? null, testId: 'attention-tab-due_soon' },
  ...(canReadJobs.value ? [{ value: 'stale' as const, label: t('attention.tabs.stale'), icon: HourglassIcon, count: stale.count.value, testId: 'attention-tab-stale' }] : []),
])
const allDone = computed(() => counter.count.value === 0 && !staleWaiting.value)
const items = computed(() => list.page.value?.items ?? [])
const pages = computed(() => (list.page.value ? pageCount(list.page.value.meta) : 1))

const reload = async (): Promise<void> => {
  await Promise.all([list.refresh(), counter.refresh(), stale.refresh()])
}
const busy = ref<string | null>(null)
const writing = ref<AttentionItemDto | null>(null)
const opened = ref<AttentionItemDto | null>(null)
const move = async (item: AttentionItemDto, stage: StageRef): Promise<void> => {
  busy.value = item.applicationId
  try {
    await moveApplication(request, item.applicationId, stage.id)
    toast.success(t('attention.moved', { name: fullName(item.candidate), stage: stageName(stage, t) }))
    await reload()
  } catch (error) {
    toast.error(t('pipeline.moveFailed', { name: fullName(item.candidate) }), { description: t(errorKeyOf(error)) })
  } finally {
    busy.value = null
  }
}
const written = async (): Promise<void> => {
  writing.value = null
  await reload()
}
const closeSheet = async (): Promise<void> => {
  opened.value = null
  await reload()
}
</script>

<template>
  <div class="grid gap-4">
    <div v-if="allDone" class="grid justify-items-start gap-2 rounded-xl border border-dashed border-input px-6 py-8" data-testid="attention-all-done">
      <span class="grid size-10 place-items-center rounded-full bg-success-soft text-success"><PartyPopperIcon class="size-5" aria-hidden="true" /></span>
      <p class="text-[0.9375rem] font-medium">{{ t('attention.allDone.title') }}</p>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('attention.allDone.body') }}</p>
    </div>
    <template v-else>
      <UnderlineTabs v-model="tab" :items="tabs" :label="t('attention.tabs.label')" />
      <StaleJobsList
        v-if="tab === 'stale'"
        :jobs="stale.jobs.value"
        :loading="stale.loading.value"
        :error-key="stale.errorKey.value"
        @reload="reload"
      />
      <template v-else>
        <div v-if="list.errorKey.value" class="grid gap-3">
          <FormAlert :message-key="list.errorKey.value" />
          <div><Button variant="outline" @click="reload">{{ t('common.retry') }}</Button></div>
        </div>
        <ul v-else-if="!list.page.value" class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-busy="true" data-testid="attention-loading">
          <li v-for="n in 4" :key="n" class="flex items-center gap-3 px-5 py-4 sm:px-6">
            <Skeleton class="size-9 rounded-full" />
            <div class="grid flex-1 gap-2"><Skeleton class="h-4 w-2/5" /><Skeleton class="h-3 w-1/4" /></div>
            <Skeleton class="hidden h-6 w-28 rounded-full md:block" />
          </li>
        </ul>
        <div v-else :class="list.loading.value ? 'opacity-60 transition-opacity' : ''" :aria-busy="list.loading.value">
          <p v-if="items.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="attention-empty">{{ t(`attention.empty.${state}`) }}</p>
          <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" :aria-label="t('attention.list')">
            <AttentionRow
              v-for="item in items"
              :key="item.applicationId"
              :item="item"
              :now="now"
              :can-send="canSend"
              :can-move="canMove"
              :busy="busy === item.applicationId"
              @open="opened = item"
              @message="writing = item"
              @move="(stage) => move(item, stage)"
            />
          </ul>
        </div>
        <PaginationBar v-if="list.page.value && pages > 1" v-model:page="page" :pages="pages" :total="list.page.value.meta.total" :disabled="list.loading.value" />
      </template>
    </template>
    <BulkComposerSheet :cards="writing ? [{ id: writing.applicationId, candidate: writing.candidate }] : []" @close="writing = null" @sent="written" />
    <CandidateSheet :candidate-id="opened?.candidate.id ?? null" :application-id="opened?.applicationId ?? null" @close="closeSheet" @erased="(gone: boolean) => (gone ? closeSheet() : reload())" />
  </div>
</template>
