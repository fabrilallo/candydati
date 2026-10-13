<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { DnsRecordDto } from '@/lib/message-schemas'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** The DNS records to publish at the domain's provider, each value one click away from the clipboard. */
defineProps<{ records: readonly DnsRecordDto[] }>()
const { t } = useI18n()
const copied = ref<string | null>(null)

const copy = async (value: string, key: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = key
  } catch (error) {
    console.error('[email-settings] copy failed', error instanceof Error ? error.message : error)
    toast.error(t('emailSettings.records.copyFailed'))
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border" data-testid="dns-records">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-20">{{ t('emailSettings.records.type') }}</TableHead>
          <TableHead>{{ t('emailSettings.records.name') }}</TableHead>
          <TableHead>{{ t('emailSettings.records.value') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="(record, index) in records" :key="`${record.type}-${record.name}-${index}`" data-testid="dns-record">
          <TableCell class="font-mono text-xs">{{ record.type }}</TableCell>
          <TableCell v-for="field in (['name', 'value'] as const)" :key="field" class="max-w-80">
            <div class="flex items-center gap-1">
              <code class="min-w-0 flex-1 truncate font-mono text-xs" :title="record[field]">{{ record[field] }}</code>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0"
                :aria-label="t('emailSettings.records.copy', { field: t(`emailSettings.records.${field}`) })"
                :data-testid="`copy-${field}-${index}`"
                @click="copy(record[field], `${field}-${index}`)"
              >
                <CheckIcon v-if="copied === `${field}-${index}`" class="text-success" aria-hidden="true" />
                <CopyIcon v-else aria-hidden="true" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
