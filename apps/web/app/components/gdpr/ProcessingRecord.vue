<script setup lang="ts">
import { PrinterIcon } from '@lucide/vue'
import { retentionCopy } from '@/lib/consent-copy'
import { formatDate } from '@/lib/format'
import { providerRows } from '@/lib/legal-docs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The registro dei trattamenti (art. 30) for "selezione del personale", filled with the organization's data from
 * `GET /privacy/processing-record`. "Stampa" prints only this record (`@media print` below).
 */
const { t, locale } = useI18n()
const trText = useAdText(locale)
const processing = useProcessingRecord()
const record = computed(() => processing.record.value)
const periods = computed(() => (record.value?.retentionDays ? retentionCopy(record.value.retentionDays, (key, params) => trText.value(key, params)) : null))
const PRINT_CLASS = 'print-record'
const print = (): void => {
  const root = document.documentElement
  root.classList.add(PRINT_CLASS)
  const done = (): void => {
    root.classList.remove(PRINT_CLASS)
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
const rows = computed(() => {
  const value = record.value
  if (!value) return []
  return [
    { id: 'controller', text: value.organization.name },
    { id: 'contact', text: value.organization.contactEmail ?? t('privacyDocs.register.contactMissing') },
    { id: 'purposes', text: t('privacyDocs.register.purposesText') },
    { id: 'legalBasis', text: t('privacyDocs.register.legalBasisText') },
    { id: 'subjects', text: t('privacyDocs.register.subjectsText') },
    { id: 'data', text: t('privacyDocs.register.dataText') },
    { id: 'retention', text: periods.value ? t('privacyDocs.register.retentionText', { selection: periods.value.selection, pool: periods.value.talentPool }) : t('privacyDocs.register.retentionMissing') },
    { id: 'measures', text: t('privacyDocs.register.measuresText') },
    { id: 'automated', text: t('privacyDocs.register.automatedText') },
  ]
})
const providers = computed(() => (record.value ? providerRows(record.value.providers) : []))
</script>

<template>
  <div class="grid gap-3">
    <div v-if="processing.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="processing.errorKey.value" />
      <div><Button variant="outline" @click="() => processing.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!record" class="h-96 w-full rounded-xl" />
    <article v-else id="processing-record" class="grid gap-5 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="record-title" data-testid="processing-record">
      <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="grid gap-1">
          <h3 id="record-title" class="text-base font-semibold tracking-tight">{{ t('privacyDocs.register.title') }}</h3>
          <p class="text-sm text-muted-foreground">{{ t('privacyDocs.register.subtitle') }}</p>
          <p class="figure text-xs text-muted-foreground">
            <span v-if="record.privacyNoticeVersion">{{ t('privacyDocs.register.notice', { version: record.privacyNoticeVersion }) }}</span>
            <span v-if="record.privacyNoticeVersion">, </span>
            <span>{{ t('privacyDocs.register.generated', { date: formatDate(record.generatedAt, locale) }) }}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" class="record-print-button" data-testid="record-print" @click="print"><PrinterIcon aria-hidden="true" />{{ t('privacyDocs.print') }}</Button>
      </header>
      <dl class="divide-y border-t">
        <div v-for="row in rows" :key="row.id" class="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4" :data-testid="`record-${row.id}`">
          <dt class="text-sm text-muted-foreground">{{ t(`privacyDocs.register.${row.id}`) }}</dt>
          <dd class="text-sm text-pretty">{{ row.text }}</dd>
        </div>
        <div class="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4" data-testid="record-recipients">
          <dt class="text-sm text-muted-foreground">{{ t('privacyDocs.register.recipients') }}</dt>
          <dd class="text-sm">
            <ul class="grid gap-1">
              <li v-for="provider in providers" :key="provider.key">
                <span class="font-medium">{{ t(provider.key) }}</span>: {{ provider.name }}
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  </div>
</template>

<style>
@media print {
  html.print-record body * {
    visibility: hidden;
  }
  html.print-record #processing-record,
  html.print-record #processing-record * {
    visibility: visible;
  }
  html.print-record #processing-record {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    border: 0;
    box-shadow: none;
    color: #111318;
    background: #fdfdfe;
  }
  html.print-record #processing-record .record-print-button {
    display: none;
  }
}
</style>
