<script setup lang="ts">
import { PencilIcon, Trash2Icon } from '@lucide/vue'
import type { RuleWords } from '@/lib/automation-view'
import type { AutomationRuleDto } from '@tt/domain'
import { Button } from '@/components/ui/button'

/** One rule as a sentence, its author, a switch to pause it, edit and delete. */
const props = defineProps<{ rule: AutomationRuleDto; words: RuleWords; author: string | null; busy: boolean }>()
const emit = defineEmits<{ toggle: [enabled: boolean]; edit: []; delete: [] }>()
const { t } = useI18n()
const sentence = computed(() => t(props.words.key, { ...props.words.params }, typeof props.words.params.count === 'number' ? props.words.params.count : 1))
</script>

<template>
  <li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="automation-rule" :data-rule-id="rule.id">
    <div class="grid min-w-0 flex-1 gap-0.5">
      <p class="text-sm text-pretty first-letter:uppercase" :class="rule.enabled ? '' : 'text-muted-foreground'" data-testid="rule-sentence">{{ sentence }}</p>
      <p class="text-xs text-muted-foreground">
        <span v-if="author">{{ t('automations.author', { name: author }) }}</span>
        <span v-if="!rule.enabled" class="ml-2 rounded-full bg-muted px-2 py-0.5 font-medium">{{ t('automations.paused') }}</span>
      </p>
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        role="switch"
        :aria-checked="rule.enabled"
        :aria-label="t('automations.toggle')"
        :disabled="busy"
        class="relative mr-2 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
        :class="rule.enabled ? 'bg-primary' : 'bg-input'"
        data-testid="rule-toggle"
        @click="emit('toggle', !rule.enabled)"
      >
        <span class="size-4 rounded-full bg-card shadow-xs transition-transform duration-150 ease-snap" :class="rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'" />
      </button>
      <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('automations.edit')" data-testid="rule-edit" @click="emit('edit')"><PencilIcon aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('automations.delete')" data-testid="rule-delete" @click="emit('delete')"><Trash2Icon aria-hidden="true" /></Button>
    </div>
  </li>
</template>
