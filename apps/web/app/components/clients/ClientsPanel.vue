<script setup lang="ts">
import type { ClientDto, ClientInput } from '@candydati/domain'
import { ArchiveIcon, ArchiveRestoreIcon, ExternalLinkIcon, PencilIcon, PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { safeExternalUrl } from '@/lib/safe-url'

/**
 * The clients of an agency: name, website, number of job ads, contacts and whether archived. Who holds `client:manage`
 * adds, edits, archives and restores; the others read. Archived clients are hidden until asked for.
 */
const props = defineProps<{ canManage: boolean }>()
const { t } = useI18n()
const store = useClients(computed(() => true))
const showArchived = ref(false)
const editing = ref<ClientDto | null>(null)
const dialogOpen = ref(false)
const busy = ref<string | null>(null)
const visible = computed(() => (showArchived.value ? store.clients.value : store.active.value))
const archivedCount = computed(() => store.clients.value.length - store.active.value.length)

const open = (client: ClientDto | null): void => {
  editing.value = client
  dialogOpen.value = true
}
const save = async (input: ClientInput) => {
  const result = editing.value ? await store.update(editing.value.id, input) : await store.create(input)
  if (result.ok) toast.success(t('clients.form.saved'))
  return result
}
const toggleArchived = async (client: ClientDto): Promise<void> => {
  if (!props.canManage) return
  busy.value = client.id
  const result = await store.setArchived(client.id, !client.archived)
  busy.value = null
  if (result.ok) toast.success(t(client.archived ? 'clients.list.restoredToast' : 'clients.list.archivedToast'))
  else toast.error(t(result.errorKey))
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="clients-list" data-testid="clients-panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="clients-list" class="text-base font-semibold tracking-tight">{{ t('clients.list.title') }}</h2>
      <div class="flex flex-wrap items-center gap-3">
        <label v-if="archivedCount > 0" class="flex items-center gap-2 text-sm">
          <input v-model="showArchived" type="checkbox" class="size-4 accent-primary" data-testid="clients-show-archived">{{ t('clients.list.showArchived', { count: archivedCount }) }}
        </label>
        <Button v-if="canManage" size="sm" data-testid="client-new" @click="open(null)"><PlusIcon aria-hidden="true" />{{ t('clients.list.add') }}</Button>
      </div>
    </div>
    <div v-if="store.errorKey.value" class="grid gap-3">
      <FormAlert message-key="clients.list.loadFailed" />
      <div><Button variant="outline" @click="() => store.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="store.loading.value && store.clients.value.length === 0" class="grid gap-3 rounded-xl panel p-5" aria-busy="true">
      <Skeleton v-for="n in 3" :key="n" class="h-10" />
    </div>
    <p v-else-if="visible.length === 0" class="rounded-lg border border-dashed border-input px-4 py-6 text-sm text-muted-foreground" data-testid="clients-empty">{{ t('clients.list.empty') }}</p>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel">
      <li v-for="client in visible" :key="client.id" class="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6" data-testid="client-row">
        <div class="grid min-w-0 gap-1">
          <p class="flex flex-wrap items-center gap-2">
            <span class="truncate text-[0.9375rem] font-medium">{{ client.name }}</span>
            <Badge v-if="client.archived" variant="outline" data-testid="client-archived">{{ t('clients.list.archived') }}</Badge>
          </p>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span class="figure">{{ t('clients.list.jobs', { count: client.jobCount }, client.jobCount) }}</span>
            <span class="figure">{{ t('clients.list.contacts', { count: client.contactCount }, client.contactCount) }}</span>
            <a v-if="safeExternalUrl(client.website)" :href="safeExternalUrl(client.website) ?? undefined" target="_blank" rel="noopener noreferrer nofollow" class="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
              {{ client.website }}<ExternalLinkIcon class="size-3" aria-hidden="true" />
            </a>
          </p>
        </div>
        <div v-if="canManage" class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" :disabled="busy === client.id" :data-testid="`client-edit-${client.id}`" @click="open(client)"><PencilIcon aria-hidden="true" />{{ t('clients.list.edit') }}</Button>
          <Button variant="ghost" size="sm" :disabled="busy === client.id" :data-testid="`client-archive-${client.id}`" @click="toggleArchived(client)">
            <component :is="client.archived ? ArchiveRestoreIcon : ArchiveIcon" aria-hidden="true" />{{ t(client.archived ? 'clients.list.restore' : 'clients.list.archive') }}
          </Button>
        </div>
      </li>
    </ul>
    <ClientFormDialog v-if="canManage" v-model:open="dialogOpen" :client="editing" :save="save" />
  </section>
</template>
