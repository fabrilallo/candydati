<script setup lang="ts">
import { providerLabel } from '@/lib/ai-models'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Which language models the whole installation uses. Set on the server: a read-only summary. Configured here: the
 * form, saved only after each chosen model answered a test call. Not ours to change: who has to do it.
 */
const { t, locale } = useI18n()
const s = useInstanceAiStatus()
const settings = computed(() => s.settings.value)
const fromServer = computed(() => settings.value?.source === 'environment')
const editable = computed(() => Boolean(settings.value?.canManage) && !fromServer.value)
const verified = computed(() => (settings.value?.verifiedAt && !fromServer.value ? formatDate(settings.value.verifiedAt, locale.value) : null))
/** The models chosen, as the server returned them (an environment may name a provider this app does not list). */
const chosen = computed(() =>
  (['assistant', 'fast'] as const).flatMap((slot) => {
    const model = settings.value?.[slot]
    return model ? [{ slot, provider: model.provider, model: model.model }] : []
  }),
)
const tone = (on: boolean) => (on ? 'success' : 'outline')
</script>

<template>
  <section class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="instance-ai-title" data-testid="instance-ai">
    <div class="grid gap-2">
      <h2 id="instance-ai-title" class="text-base font-semibold tracking-tight">{{ t('instanceAi.title') }}</h2>
      <div v-if="settings" class="flex flex-wrap items-center gap-2">
        <Badge v-if="fromServer" variant="secondary" data-testid="instance-ai-source">{{ t('instanceAi.state.environment') }}</Badge>
        <Badge :variant="tone(settings.assistantEnabled)" data-testid="instance-ai-assistant-state">{{ t(settings.assistantEnabled ? 'instanceAi.state.assistantOn' : 'instanceAi.state.assistantOff') }}</Badge>
        <Badge :variant="tone(settings.fastEnabled)" data-testid="instance-ai-fast-state">{{ t(settings.fastEnabled ? 'instanceAi.state.fastOn' : 'instanceAi.state.fastOff') }}</Badge>
      </div>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('instanceAi.intro') }}</p>
    </div>

    <div v-if="s.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="s.errorKey.value" />
      <div><Button variant="outline" data-testid="instance-ai-retry" @click="() => s.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!settings" class="grid gap-3" aria-busy="true" :aria-label="t('instanceAi.loading')">
      <Skeleton class="h-4 w-2/3" />
      <Skeleton class="h-40 w-full" />
    </div>
    <template v-else>
      <InstanceAiNotes />
      <p v-if="fromServer" class="text-sm text-pretty">{{ t('instanceAi.explain.environment') }}</p>
      <p v-else-if="verified" class="text-sm text-muted-foreground" data-testid="instance-ai-verified">{{ t('instanceAi.explain.verified', { date: verified }) }}</p>
      <InstanceAiForm v-if="editable" :settings="settings" />
      <template v-else>
        <dl v-if="chosen.length > 0" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="instance-ai-summary">
          <template v-for="row in chosen" :key="row.slot">
            <dt class="text-muted-foreground">{{ t(`instanceAi.${row.slot}.title`) }}</dt>
            <dd class="break-all">{{ providerLabel(row.provider) }} · <span class="font-mono">{{ row.model }}</span></dd>
          </template>
        </dl>
        <p v-if="!fromServer && !settings.assistantEnabled && !settings.fastEnabled" class="rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning" data-testid="instance-ai-ask-admin">
          {{ t('instanceAi.explain.askAdmin') }}
        </p>
      </template>
    </template>
  </section>
</template>
