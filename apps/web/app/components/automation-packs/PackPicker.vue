<script setup lang="ts">
import type { AutomationPackDto } from '@candydati/domain'

/**
 * Checkboxes, one per automation pack. `locked` packs (brought by a template) show as chosen and cannot be unticked
 * here. Emits the chosen ids in the order of the list.
 */
const props = withDefaults(defineProps<{ packs: readonly AutomationPackDto[]; modelValue: readonly string[]; locked?: readonly string[]; idPrefix: string }>(), { locked: () => [] })
const emit = defineEmits<{ 'update:modelValue': [ids: readonly string[]] }>()
const { t } = useI18n()
const toggle = (id: string, on: boolean): void => {
  const chosen = new Set(on ? [...props.modelValue, id] : props.modelValue.filter((item) => item !== id))
  emit('update:modelValue', props.packs.map((pack) => pack.id).filter((packId) => chosen.has(packId)))
}
</script>

<template>
  <ul class="grid gap-2" data-testid="pack-picker">
    <li v-for="pack in packs" :key="pack.id" class="flex items-start gap-2.5">
      <input
        :id="`${idPrefix}-${pack.id}`"
        type="checkbox"
        class="mt-0.5 size-4 accent-primary"
        :checked="locked.includes(pack.id) || modelValue.includes(pack.id)"
        :disabled="locked.includes(pack.id)"
        :data-testid="`pack-option-${pack.id}`"
        @change="toggle(pack.id, ($event.target as HTMLInputElement).checked)"
      />
      <label :for="`${idPrefix}-${pack.id}`" class="grid gap-0.5 text-sm">
        <span class="font-medium">{{ pack.name }}</span>
        <span v-if="locked.includes(pack.id)" class="text-xs text-muted-foreground">{{ t('automationPacks.picker.fromTemplate') }}</span>
        <span v-else-if="pack.description" class="text-xs text-muted-foreground">{{ pack.description }}</span>
      </label>
    </li>
  </ul>
</template>
