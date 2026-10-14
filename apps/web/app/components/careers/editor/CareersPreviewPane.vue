<script setup lang="ts">
import { EyeIcon, MonitorIcon, SmartphoneIcon } from '@lucide/vue'
import type { CareersMediaDto, CareersPageDocument, Locale, PublicCareersDto } from '@tt/domain'

/**
 * The live preview: the public page component itself, in preview mode, at desktop width or in a phone-wide frame
 * (the page lays out with container queries). It scrolls inside its frame and is inert: nothing in it can be focused
 * or clicked, it is a picture of the page.
 */
defineProps<{ page: CareersPageDocument; media: Readonly<Record<string, CareersMediaDto>>; careers: PublicCareersDto; locale: Locale }>()
const { t } = useI18n()
type Device = 'desktop' | 'mobile'
const device = ref<Device>('desktop')
const DEVICES = [
  { value: 'desktop', icon: MonitorIcon },
  { value: 'mobile', icon: SmartphoneIcon },
] as const
</script>

<template>
  <section :aria-label="t('careersEditor.preview.title')" class="grid gap-3" data-testid="careers-preview-pane">
    <div class="flex flex-wrap items-center justify-between gap-3 px-1">
      <p class="flex items-center gap-2 text-sm font-medium">
        <EyeIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {{ t('careersEditor.preview.title') }}
        <span class="font-normal text-muted-foreground">{{ t(`locales.${locale}`) }}</span>
      </p>
      <div role="group" :aria-label="t('careersEditor.preview.device')" class="inline-flex rounded-md border bg-card p-0.5">
        <button
          v-for="item in DEVICES"
          :key="item.value"
          type="button"
          :aria-pressed="device === item.value"
          class="inline-flex h-7 items-center gap-1.5 rounded-[0.375rem] px-2.5 text-xs font-medium outline-none transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35"
          :class="device === item.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'"
          :data-testid="`careers-preview-${item.value}`"
          @click="device = item.value"
        >
          <component :is="item.icon" class="size-3.5" aria-hidden="true" />{{ t(`careersEditor.preview.${item.value}`) }}
        </button>
      </div>
    </div>
    <div
      class="max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-xl border bg-muted/50 outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
      :class="device === 'mobile' ? 'py-4' : ''"
      tabindex="0"
      role="region"
      :aria-label="t('careersEditor.preview.frame')"
    >
      <div
        class="overflow-hidden bg-background"
        :class="device === 'mobile' ? 'mx-auto w-full max-w-[390px] rounded-[1.25rem] border shadow-sm' : 'rounded-xl'"
        inert
        :data-device="device"
        data-testid="careers-preview"
      >
        <CareersSite :page="page" :media="media" :careers="careers" mode="preview" :locale="locale" />
      </div>
    </div>
  </section>
</template>
