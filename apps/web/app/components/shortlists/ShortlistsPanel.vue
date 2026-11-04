<script setup lang="ts">
import { SHORTLIST_TOKEN_TTL_DAYS, type JobDto } from '@candydati/domain'
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { can } from '@/lib/permissions-ui'

/**
 * Shortlists of a client job (PRODUCT.md §3.5): what was sent and how the client answered, and, for who may send, a new
 * one. The client's answers are opinions: nothing here moves or decides an application.
 */
const props = defineProps<{ job: JobDto }>()
const { t } = useI18n()
const { viewer } = useViewer()
const canSend = computed(() => can(viewer.value?.role ?? null, 'shortlist:send'))
const { recruitsForClients } = useAgencySetting()
const { jobClient, errorKey: clientErrorKey } = useJobClient(props.job.id, recruitsForClients)
const clientStore = useClients(recruitsForClients)
const store = useJobShortlists(props.job.id)
const composing = ref(false)
const client = computed(() => clientStore.clients.value.find((candidate) => candidate.id === jobClient.value?.client?.id) ?? null)
const blockedKey = computed(() => (props.job.status === 'closed' ? 'shortlists.errors.job_closed' : client.value?.archived ? 'shortlists.errors.client_archived' : null))
</script>

<template>
  <div class="grid gap-6" data-testid="shortlists-panel">
    <FormAlert v-if="clientErrorKey" :message-key="clientErrorKey" />
    <p v-else-if="jobClient && !jobClient.client" class="rounded-lg border border-dashed border-input px-4 py-4 text-sm text-muted-foreground" data-testid="shortlists-no-client">{{ t('shortlists.noClient') }}</p>
    <template v-else-if="jobClient?.client">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('shortlists.intro', { client: jobClient.client.name, days: SHORTLIST_TOKEN_TTL_DAYS }) }}</p>
        <Button v-if="canSend && !composing && client && !blockedKey" data-testid="shortlist-new" @click="composing = true"><PlusIcon aria-hidden="true" />{{ t('shortlists.compose.open') }}</Button>
      </div>
      <p v-if="canSend && blockedKey" class="text-sm text-muted-foreground" data-testid="shortlists-blocked">{{ t(blockedKey) }}</p>
      <ShortlistComposer v-if="composing && client" :job-id="job.id" :client="client" :display="jobClient.display" :send="store.send" @done="composing = false" @cancel="composing = false" />

      <section class="grid gap-3" aria-labelledby="shortlists-sent">
        <h2 id="shortlists-sent" class="text-base font-semibold tracking-tight">{{ t('shortlists.list.title') }}</h2>
        <div v-if="store.errorKey.value" class="grid gap-3">
          <FormAlert message-key="shortlists.list.loadFailed" />
          <div><Button variant="outline" @click="() => store.refresh()">{{ t('common.retry') }}</Button></div>
        </div>
        <div v-else-if="store.loading.value && store.shortlists.value.length === 0" class="grid gap-3 rounded-xl panel p-5" aria-busy="true"><Skeleton v-for="n in 2" :key="n" class="h-16" /></div>
        <p v-else-if="store.shortlists.value.length === 0" class="rounded-lg border border-dashed border-input px-4 py-6 text-sm text-muted-foreground" data-testid="shortlists-empty">{{ t('shortlists.list.empty') }}</p>
        <div v-else class="grid gap-4">
          <ShortlistCard v-for="shortlist in store.shortlists.value" :key="shortlist.id" :shortlist="shortlist" :can-revoke="canSend" :revoking="store.revoking.value === shortlist.id" @revoke="store.revoke" />
        </div>
      </section>
    </template>
  </div>
</template>
