<script setup lang="ts">
import { CopyIcon, PackageIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import type { RuleWords } from '@/lib/automation-view'
import { conditionParts, describeTrigger, type ConditionPart } from '@/lib/automation-trigger-view'
import type { AutomationRuleDto } from '@candydati/domain'
import { Button } from '@/components/ui/button'

/**
 * One rule (of a job or of a pack): its trigger, what it does as a sentence, its conditions, its author, the pack it was
 * copied from, a switch to pause it, copy, edit and delete.
 */
const props = withDefaults(
  defineProps<{ rule: Pick<AutomationRuleDto, 'id' | 'trigger' | 'conditions' | 'enabled'>; words: RuleWords; author: string | null; busy: boolean; packName?: string | null; copyable?: boolean }>(),
  { packName: null, copyable: true },
)
const emit = defineEmits<{ toggle: [enabled: boolean]; edit: []; delete: []; copy: [] }>()
const { t } = useI18n()
const sentence = computed(() => t(props.words.key, { ...props.words.params }, typeof props.words.params.count === 'number' ? props.words.params.count : 1))
const when = computed(() => {
  const words = describeTrigger(props.rule.trigger)
  return t(words.key, { ...words.params }, words.params.count ?? 1)
})
const valueName = (part: ConditionPart, value: string): string =>
  part.kind === 'sources' ? t(`automations.sources.${value}`) : part.kind === 'consentScopes' ? t(`candidate.scopes.${value}`) : value
const onlyIf = computed(() => {
  const parts = conditionParts(props.rule.conditions)
  if (parts.length === 0) return null
  const pieces = parts.map((part) => t(`automations.conditions.${part.kind}`, { list: part.values.map((value) => valueName(part, value)).join(', ') }))
  return t('automations.conditions.onlyIf', { list: pieces.join(' · ') })
})
</script>

<template>
  <li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="automation-rule" :data-rule-id="rule.id">
    <div class="grid min-w-0 flex-1 gap-0.5">
      <p class="text-xs font-medium text-muted-foreground first-letter:uppercase" data-testid="rule-trigger-words">{{ when }}</p>
      <p class="text-sm text-pretty first-letter:uppercase" :class="rule.enabled ? '' : 'text-muted-foreground'" data-testid="rule-sentence">{{ sentence }}</p>
      <p v-if="onlyIf" class="text-xs text-pretty text-muted-foreground" data-testid="rule-conditions-words">{{ onlyIf }}</p>
      <p class="text-xs text-muted-foreground">
        <span v-if="author">{{ t('automations.author', { name: author }) }}</span>
        <span v-if="packName" class="ml-2 inline-flex items-center gap-1" data-testid="rule-pack"><PackageIcon class="size-3" aria-hidden="true" />{{ t('automationPacks.fromPack', { name: packName }) }}</span>
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
      <Button v-if="copyable" variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('automations.copy.rule')" data-testid="rule-copy" @click="emit('copy')"><CopyIcon aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('automations.edit')" data-testid="rule-edit" @click="emit('edit')"><PencilIcon aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('automations.delete')" data-testid="rule-delete" @click="emit('delete')"><Trash2Icon aria-hidden="true" /></Button>
    </div>
  </li>
</template>
