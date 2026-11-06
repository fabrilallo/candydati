<script setup lang="ts">
import { PackageIcon } from '@lucide/vue'
import { getTemplatePacks } from '@/lib/automation-pack-api'
import { loaded } from '@/lib/job-api'

/**
 * On a new job: the automation packs to attach when it is first saved. The template's own packs come anyway and show
 * as chosen. Nothing shows when the organization has no pack.
 */
const props = defineProps<{ templateId: string | null; modelValue: readonly string[] }>()
const emit = defineEmits<{ 'update:modelValue': [ids: readonly string[]] }>()
const { t } = useI18n()
const request = useJobsApi()
const packs = useAutomationPacks()
const { data } = useFreshAsyncData(`new-job-template-packs-${props.templateId ?? 'none'}`, () =>
  props.templateId === null ? Promise.resolve({ data: [] as readonly string[], errorKey: null }) : loaded(() => getTemplatePacks(request, props.templateId ?? '')),
)
const locked = computed(() => data.value?.data ?? [])
</script>

<template>
  <section v-if="(packs.packs.value ?? []).length > 0" class="grid gap-3 rounded-xl panel p-5" aria-labelledby="new-job-packs" data-testid="new-job-packs">
    <div class="grid gap-1">
      <h2 id="new-job-packs" class="flex items-center gap-2 text-base font-semibold tracking-tight"><PackageIcon class="size-4" aria-hidden="true" />{{ t('automationPacks.picker.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('automationPacks.picker.description') }}</p>
    </div>
    <PackPicker id-prefix="new-job-pack" :packs="packs.packs.value ?? []" :model-value="modelValue" :locked="locked" @update:model-value="emit('update:modelValue', $event)" />
  </section>
</template>
