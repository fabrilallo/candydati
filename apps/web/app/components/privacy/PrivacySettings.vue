<script setup lang="ts">
import { retentionCopy } from '@/lib/consent-copy'
import { formatDate } from '@/lib/format'
import { initialPrivacyForm } from '@/lib/privacy-form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Current version, editor of the next one, and every past version. Mounted only with `privacy:manage`. */
const { t, locale } = useI18n()
const trText = useAdText(locale)
const tr = (key: string, params?: Record<string, string | number>) => trText.value(key, params)
const settings = usePrivacySettings()
const state = computed(() => settings.state.value)
const active = computed(() => state.value?.active ?? null)
const nextVersion = computed(() => (state.value?.versions.reduce((max, notice) => Math.max(max, notice.version), 0) ?? 0) + 1)
const initial = computed(() => (state.value ? initialPrivacyForm(state.value.active, state.value.template, locale.value) : null))
const periods = computed(() => (active.value ? retentionCopy(active.value.retentionDays, tr) : null))
// A fresh editor after each publication, starting from the version just published.
const editorKey = computed(() => active.value?.id ?? 'none')
</script>

<template>
  <div class="grid gap-8">
    <div v-if="settings.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="settings.errorKey.value" />
      <div><Button variant="outline" @click="() => settings.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!state" class="grid gap-4" aria-busy="true" data-testid="privacy-loading">
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-80 w-full rounded-xl" />
    </div>
    <template v-else>
      <section class="grid gap-2 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="privacy-current" data-testid="privacy-current">
        <h2 id="privacy-current" class="text-base font-semibold tracking-tight">{{ t('privacy.current') }}</h2>
        <template v-if="active && periods">
          <p class="text-sm">
            <span class="font-medium">{{ t('privacy.version', { version: active.version }) }}</span>
            <span class="figure text-muted-foreground">, {{ t('privacy.publishedOn', { date: formatDate(active.createdAt, locale) }) }}</span>
          </p>
          <p class="text-sm text-muted-foreground">{{ t('privacy.retentionLine', { selection: periods.selection, pool: periods.talentPool }) }} · {{ active.contactEmail }}</p>
        </template>
        <p v-else class="text-sm text-muted-foreground" data-testid="privacy-none">{{ t('privacy.none') }}</p>
      </section>

      <section class="grid gap-4" aria-labelledby="privacy-next">
        <div class="grid gap-1">
          <h2 id="privacy-next" class="text-lg font-semibold tracking-tight">{{ active ? t('privacy.nextTitle', { version: nextVersion }) : t('privacy.firstTitle') }}</h2>
          <p class="text-sm text-muted-foreground">{{ active ? t('privacy.nextIntro') : t('privacy.firstIntro') }}</p>
        </div>
        <PrivacyNoticeEditor
          v-if="initial"
          :key="editorKey"
          :initial="initial"
          :next-version="nextVersion"
          :publishing="settings.publishing.value"
          :error-key="settings.publishErrorKey.value"
          :load-template="settings.template"
          @publish="settings.publish"
        />
      </section>

      <section v-if="state.versions.length > 0" class="grid gap-3" aria-labelledby="privacy-history">
        <h2 id="privacy-history" class="text-lg font-semibold tracking-tight">{{ t('privacy.history') }}</h2>
        <PrivacyVersions :versions="state.versions" :active-id="active?.id ?? null" />
      </section>
    </template>
  </div>
</template>
