<script setup lang="ts">
import { CheckIcon, CircleAlertIcon } from '@lucide/vue'
import { CORNER_STYLES, HEADING_FONTS, type CareersTheme, type CornerStyle, type HeadingFont } from '@candydati/domain'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { headingFontFamily } from '@/lib/careers-site'
import { accentVerdict, normalizeHex } from '@/lib/careers-theme-view'

/**
 * The page's look: one accent (refused when no text reads on it), a heading font and the corner style. The verdict
 * is live, with the measured contrast of the button label.
 */
const props = defineProps<{ theme: CareersTheme }>()
const emit = defineEmits<{ patch: [theme: CareersTheme] }>()
const { t, locale } = useI18n()

const hex = ref(props.theme.accent)
watch(() => props.theme.accent, (accent) => {
  if (normalizeHex(hex.value) !== accent) hex.value = accent
})
const hexInvalid = computed(() => normalizeHex(hex.value) === null)
const verdict = computed(() => accentVerdict(props.theme.accent))
const ratio = computed(() => verdict.value.ratio.toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

const setAccent = (value: string): void => {
  hex.value = value
  const accent = normalizeHex(value)
  if (accent) emit('patch', { ...props.theme, accent })
}
const setFont = (value: string): void => emit('patch', { ...props.theme, headingFont: HEADING_FONTS.find((font) => font === value) ?? 'geist' })
const setCorners = (value: string): void => emit('patch', { ...props.theme, corners: CORNER_STYLES.find((style) => style === value) ?? 'soft' })
const fontStyle = (font: HeadingFont) => ({ fontFamily: headingFontFamily(font) })
const cornerRadius = (corners: CornerStyle): string => (corners === 'soft' ? '9999px' : '0.125rem')
</script>

<template>
  <section class="grid gap-5 rounded-xl border bg-card px-5 py-5 sm:px-6" aria-labelledby="cp-theme-title" data-testid="careers-theme">
    <h2 id="cp-theme-title" class="text-base font-semibold tracking-tight">{{ t('careersEditor.theme.title') }}</h2>

    <div class="grid gap-1.5">
      <Label for="cp-accent-hex">{{ t('careersEditor.theme.accent') }}</Label>
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="theme.accent"
          class="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
          :aria-label="t('careersEditor.theme.accentPicker')"
          data-testid="careers-field-accent-color"
          @input="setAccent(($event.target as HTMLInputElement).value)"
        >
        <Input id="cp-accent-hex" :model-value="hex" class="figure max-w-32 font-mono" maxlength="7" spellcheck="false" :aria-invalid="hexInvalid || !verdict.passes || undefined" aria-describedby="cp-accent-verdict" data-testid="careers-field-accent" @update:model-value="setAccent(String($event))" />
      </div>
      <p v-if="hexInvalid" role="alert" class="text-xs font-medium text-destructive">{{ t('careersEditor.errors.hex_color') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <span
        class="inline-flex h-10 items-center px-5 text-sm font-semibold"
        :style="{ background: theme.accent, color: verdict.foreground, borderRadius: cornerRadius(theme.corners) }"
        aria-hidden="true"
        data-testid="careers-accent-swatch"
      >{{ t('careersSite.hero.cta') }}</span>
      <p id="cp-accent-verdict" :role="verdict.passes ? undefined : 'alert'" class="flex items-start gap-1.5 text-sm" :class="verdict.passes ? 'text-success' : 'text-destructive'" :data-passes="verdict.passes" data-testid="careers-accent-verdict">
        <component :is="verdict.passes ? CheckIcon : CircleAlertIcon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {{ t(verdict.passes ? 'careersEditor.theme.passes' : 'careersEditor.theme.fails', { ratio }) }}
      </p>
    </div>

    <div class="grid gap-1.5">
      <Label for="cp-heading-font">{{ t('careersEditor.theme.font') }}</Label>
      <NativeSelect id="cp-heading-font" :model-value="theme.headingFont" data-testid="careers-field-heading-font" @update:model-value="setFont">
        <option v-for="font in HEADING_FONTS" :key="font" :value="font" :style="fontStyle(font)">{{ t(`careersEditor.theme.fonts.${font}`) }}</option>
      </NativeSelect>
      <p class="text-2xl leading-tight" :style="fontStyle(theme.headingFont)" aria-hidden="true">{{ t('careersEditor.theme.sample') }}</p>
    </div>

    <div class="grid gap-1.5">
      <Label for="cp-corners">{{ t('careersEditor.theme.corners') }}</Label>
      <NativeSelect id="cp-corners" :model-value="theme.corners" data-testid="careers-field-corners" @update:model-value="setCorners">
        <option v-for="style in CORNER_STYLES" :key="style" :value="style">{{ t(`careersEditor.theme.cornerStyles.${style}`) }}</option>
      </NativeSelect>
    </div>
  </section>
</template>
