<script setup lang="ts">
import { CLIENT_DISPLAYS, type ClientDisplay } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { can } from '@/lib/permissions-ui'

/**
 * The client of an ad, for an organization that recruits for clients (nothing renders otherwise): which client, or
 * none, and how candidates see it. Saved apart from the ad (PUT /jobs/:id/client), so it never touches the content.
 */
const props = defineProps<{ jobId: string; readOnly: boolean }>()
const { t } = useI18n()
const { viewer } = useViewer()
/** Linking a client, or naming a confidential one, is for who manages clients: editing the ad is not enough. */
const locked = computed(() => props.readOnly || !can(viewer.value?.role ?? null, 'client:manage'))
const { recruitsForClients } = useAgencySetting()
const link = useJobClient(props.jobId, recruitsForClients)
const store = useClients(recruitsForClients)
const clientId = ref<string>('')
const display = ref<ClientDisplay>('named')

watch(
  link.jobClient,
  (current) => {
    clientId.value = current?.client?.id ?? ''
    display.value = current?.display ?? 'named'
  },
  { immediate: true },
)
/** Active clients, plus the current one when it was archived since (it keeps its jobs). */
const options = computed(() => {
  const current = link.jobClient.value?.client
  const active = store.active.value.map((client) => ({ id: client.id, label: client.name }))
  return current?.archived ? [...active, { id: current.id, label: t('jobClient.archivedSuffix', { name: current.name }) }] : active
})
const selectedName = computed(() => options.value.find((option) => option.id === clientId.value)?.label ?? '')
const displayOptions = computed(() => CLIENT_DISPLAYS.map((value) => ({ value, label: t(`jobClient.display.${value}`) })))
const explainKey = computed(() => (clientId.value === '' ? 'jobClient.explain.none' : `jobClient.explain.${display.value}`))
const dirty = computed(() => clientId.value !== (link.jobClient.value?.client?.id ?? '') || (clientId.value !== '' && display.value !== link.jobClient.value?.display))

const save = async (): Promise<void> => {
  if (await link.save(clientId.value === '' ? null : clientId.value, display.value)) toast.success(t('jobClient.saved'))
}
</script>

<template>
  <section v-if="recruitsForClients" class="grid gap-4 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="job-client-title" data-testid="job-client">
    <h2 id="job-client-title" class="text-base font-semibold tracking-tight">{{ t('jobClient.title') }}</h2>
    <FormAlert v-if="link.errorKey.value" message-key="jobClient.loadFailed" />
    <form v-else-if="link.jobClient.value" class="grid gap-4" novalidate @submit.prevent="save">
      <FormField id="job-client-select" :label="t('jobClient.label')">
        <NativeSelect id="job-client-select" v-model="clientId" :disabled="locked || link.saving.value" data-testid="job-client-select">
          <option value="">{{ t('jobClient.none') }}</option>
          <option v-for="option in options" :key="option.id" :value="option.id">{{ option.label }}</option>
        </NativeSelect>
      </FormField>
      <p v-if="options.length === 0" class="text-sm text-muted-foreground">
        {{ t('jobClient.noClients') }}
        <NuxtLink to="/app/settings/clients" class="font-medium text-link underline-offset-4 hover:underline">{{ t('jobClient.manage') }}</NuxtLink>
      </p>
      <div v-if="clientId !== ''" class="grid gap-1.5">
        <p id="job-client-display-label" class="text-sm font-medium">{{ t('jobClient.display.label') }}</p>
        <SegmentedControl id="job-client-display" :model-value="display" :options="displayOptions" :label="t('jobClient.display.label')" :disabled="locked || link.saving.value" @update:model-value="display = $event as ClientDisplay" />
      </div>
      <p class="text-sm text-pretty text-muted-foreground" data-testid="job-client-explain">{{ t(explainKey, { client: selectedName }) }}</p>
      <FormAlert :message-key="link.saveErrorKey.value" />
      <div v-if="!locked"><Button type="submit" variant="outline" :disabled="!dirty || link.saving.value" data-testid="job-client-save">{{ t('jobClient.save') }}</Button></div>
    </form>
  </section>
</template>
