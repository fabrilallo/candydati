<script setup lang="ts">
import { formatDate } from '@/lib/format'
import { formFromSettings, fromPreview, instanceEmailState } from '@/lib/instance-email-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * How the whole installation sends email. Set on the server: a read-only summary. Configured here: the form, saved only
 * after a test email went through. Not configured and not ours to change: who has to do it.
 */
const { t, locale } = useI18n()
const s = useInstanceEmailStatus()
const settings = computed(() => s.settings.value)
const state = computed(() => (settings.value ? instanceEmailState(settings.value) : null))
const from = computed(() => (settings.value ? fromPreview(formFromSettings(settings.value)) : null))
const TONES = { ready: 'success', none: 'warning', environment: 'secondary' } as const
const explain = computed(() => {
  const current = settings.value
  if (!current || !state.value) return null
  if (state.value === 'none') return current.canManage ? t('instanceEmail.explain.none') : null
  if (state.value === 'environment') return t('instanceEmail.explain.environment')
  if (current.verifiedAt) return t('instanceEmail.explain.readyVerified', { from: from.value ?? '', date: formatDate(current.verifiedAt, locale.value) })
  return t('instanceEmail.explain.ready', { from: from.value ?? '' })
})
</script>

<template>
  <section class="grid gap-5 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="instance-email-title" data-testid="instance-email">
    <div class="grid gap-1">
      <div class="flex flex-wrap items-center gap-3">
        <h2 id="instance-email-title" class="text-base font-semibold tracking-tight">{{ t('instanceEmail.title') }}</h2>
        <Badge v-if="state" :variant="TONES[state]" data-testid="instance-email-state">{{ t(`instanceEmail.state.${state}`) }}</Badge>
      </div>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('instanceEmail.intro') }}</p>
    </div>

    <div v-if="s.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="s.errorKey.value" />
      <div><Button variant="outline" data-testid="instance-email-retry" @click="() => s.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!settings || !state" class="grid gap-3" aria-busy="true" :aria-label="t('instanceEmail.loading')">
      <Skeleton class="h-4 w-2/3" />
      <Skeleton class="h-40 w-full" />
    </div>
    <template v-else>
      <p v-if="explain" class="text-sm text-pretty" data-testid="instance-email-explain">{{ explain }}</p>
      <dl v-if="state === 'environment'" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="instance-email-summary">
        <template v-if="settings.provider">
          <dt class="text-muted-foreground">{{ t('instanceEmail.summary.provider') }}</dt>
          <dd>{{ t(`instanceEmail.providers.${settings.provider}`) }}</dd>
        </template>
        <template v-if="settings.smtp">
          <dt class="text-muted-foreground">{{ t('instanceEmail.summary.host') }}</dt>
          <dd class="font-mono break-all">{{ settings.smtp.host }}:{{ settings.smtp.port }}</dd>
        </template>
        <template v-if="from">
          <dt class="text-muted-foreground">{{ t('instanceEmail.summary.from') }}</dt>
          <dd class="font-mono break-all">{{ from }}</dd>
        </template>
      </dl>
      <InstanceEmailForm v-else-if="settings.canManage" :settings="settings" />
      <p v-else-if="state === 'none'" class="rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning" data-testid="instance-email-ask-admin">
        {{ t('instanceEmail.explain.askAdmin') }}
      </p>
    </template>
  </section>
</template>
