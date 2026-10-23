<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { buildTrackedLink, CHANNEL_PRESETS, CUSTOM_CHANNEL, trackedLabels } from '@/lib/tracked-link'

/**
 * Builds the link to share on one channel: the public ad URL with `utm_source` and, optionally, `utm_campaign`. What the
 * person types is shown back the way the reports will name it. `jobUrl` is null while the ad is not published.
 */
const props = defineProps<{ jobUrl: string | null }>()
const { t } = useI18n()
const choice = ref('')
const custom = ref('')
const campaign = ref('')
const isCustom = computed(() => choice.value === CUSTOM_CHANNEL)
const source = computed(() => (isCustom.value ? custom.value : choice.value))
const labels = computed(() => trackedLabels({ source: source.value, campaign: campaign.value }))
const link = computed(() => (props.jobUrl === null ? null : buildTrackedLink({ jobUrl: props.jobUrl, source: source.value, campaign: campaign.value })))
const changed = (typed: string, saved: string): boolean => typed.trim() !== '' && typed.trim() !== saved
const presetLabel = (preset: (typeof CHANNEL_PRESETS)[number]): string => preset.name ?? t(`trackedLinks.presets.${preset.source}`)
</script>

<template>
  <section class="grid gap-4 rounded-xl panel p-5 sm:p-6" aria-labelledby="tracked-links-title" data-testid="tracked-links">
    <div class="grid gap-1">
      <h2 id="tracked-links-title" class="text-base font-semibold tracking-tight">{{ t('trackedLinks.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('trackedLinks.description') }}</p>
    </div>
    <p v-if="jobUrl === null" class="text-sm text-muted-foreground" data-testid="tracked-links-unpublished">{{ t('trackedLinks.notPublished') }}</p>
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid content-start gap-2">
          <Label for="tracked-channel">{{ t('trackedLinks.channel') }}</Label>
          <NativeSelect id="tracked-channel" v-model="choice" data-testid="tracked-channel">
            <option value="" disabled>{{ t('trackedLinks.choose') }}</option>
            <option v-for="preset in CHANNEL_PRESETS" :key="preset.source" :value="preset.source">{{ presetLabel(preset) }}</option>
            <option :value="CUSTOM_CHANNEL">{{ t('trackedLinks.other') }}</option>
          </NativeSelect>
          <template v-if="isCustom">
            <Label for="tracked-custom" class="mt-1">{{ t('trackedLinks.customChannel') }}</Label>
            <Input id="tracked-custom" v-model="custom" autocomplete="off" maxlength="60" aria-describedby="tracked-custom-hint" data-testid="tracked-custom" />
            <p id="tracked-custom-hint" class="text-xs text-muted-foreground">{{ t('trackedLinks.customHint') }}</p>
            <p v-if="changed(custom, labels.source ?? '')" class="text-xs text-muted-foreground" data-testid="tracked-source-saved">{{ labels.source ? t('trackedLinks.savedAs', { value: labels.source }) : t('trackedLinks.invalidChannel') }}</p>
          </template>
        </div>
        <div class="grid content-start gap-2">
          <Label for="tracked-campaign">{{ t('trackedLinks.campaign') }}</Label>
          <Input id="tracked-campaign" v-model="campaign" autocomplete="off" maxlength="60" aria-describedby="tracked-campaign-hint" data-testid="tracked-campaign" />
          <p id="tracked-campaign-hint" class="text-xs text-muted-foreground">{{ t('trackedLinks.campaignHint') }}</p>
          <p v-if="changed(campaign, labels.campaign)" class="text-xs text-muted-foreground" data-testid="tracked-campaign-saved">{{ labels.campaign ? t('trackedLinks.savedAs', { value: labels.campaign }) : t('trackedLinks.invalidCampaign') }}</p>
        </div>
      </div>
      <div class="grid gap-2" aria-live="polite">
        <p class="text-sm font-medium">{{ t('trackedLinks.link') }}</p>
        <div v-if="link" class="flex min-w-0 items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm" data-testid="tracked-link-url">{{ link.url }}</code>
          <CopyButton :text="link.url" :label="t('trackedLinks.copy')" />
        </div>
        <p v-else class="text-sm text-muted-foreground" data-testid="tracked-link-empty">{{ t('trackedLinks.pick') }}</p>
      </div>
      <p class="text-xs text-muted-foreground">{{ t('trackedLinks.privacy') }}</p>
    </template>
  </section>
</template>
