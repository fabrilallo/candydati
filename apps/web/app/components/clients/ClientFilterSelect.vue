<script setup lang="ts">
import type { ClientDto } from '@candydati/domain'
import { NativeSelect } from '@/components/ui/native-select'

/** "All clients" or one client, archived ones included (their jobs and figures stay). Used by the jobs list and the reports. */
defineProps<{ id: string; clients: readonly ClientDto[]; label: string; testId?: string }>()
const model = defineModel<string | null>({ required: true })
const { t } = useI18n()
</script>

<template>
  <div class="grid w-full min-w-0 gap-1.5 sm:w-auto">
    <label :for="id" class="text-sm font-medium">{{ label }}</label>
    <NativeSelect :id="id" :model-value="model ?? ''" class="w-full sm:w-56" :data-testid="testId" @update:model-value="(value) => (model = String(value) === '' ? null : String(value))">
      <option value="">{{ t('clients.filter.all') }}</option>
      <option v-for="client in clients" :key="client.id" :value="client.id">{{ client.archived ? t('jobClient.archivedSuffix', { name: client.name }) : client.name }}</option>
    </NativeSelect>
  </div>
</template>
