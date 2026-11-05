<script setup lang="ts">
import type { BuiltInSkillDto } from '@candydati/domain'
import { filterBuiltIn } from '@/lib/skill-alias-view'
import { Input } from '@/components/ui/input'

/** The shared dictionary: each skill with its built-in aliases and a switch per alias, to turn off what this organization does not want. */
const props = defineProps<{ entries: readonly BuiltInSkillDto[]; busy: string | null }>()
const emit = defineEmits<{ toggle: [alias: string, enabled: boolean] }>()
const { t } = useI18n()
const query = ref('')
const shown = computed(() => filterBuiltIn(props.entries, query.value))
const off = computed(() => props.entries.reduce((total, entry) => total + entry.aliases.filter((item) => !item.enabled).length, 0))
</script>

<template>
  <section class="grid gap-4" aria-labelledby="built-in-title" data-testid="built-in-aliases">
    <div class="grid gap-1">
      <h2 id="built-in-title" class="text-base font-semibold tracking-tight">{{ t('skills.builtIn.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('skills.builtIn.body') }}</p>
    </div>
    <div class="grid gap-1.5 sm:max-w-sm">
      <label for="built-in-search" class="sr-only">{{ t('skills.builtIn.search') }}</label>
      <Input id="built-in-search" v-model="query" type="search" :placeholder="t('skills.builtIn.search')" autocomplete="off" data-testid="built-in-search" />
    </div>
    <p v-if="shown.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="built-in-empty">{{ t('skills.builtIn.none') }}</p>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel" :aria-label="t('skills.builtIn.title')">
      <li v-for="entry in shown" :key="entry.id" class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-6" data-testid="built-in-item">
        <p class="w-40 shrink-0 text-sm font-medium">{{ entry.name }}</p>
        <ul class="flex flex-wrap gap-x-5 gap-y-2">
          <li v-for="item in entry.aliases" :key="item.alias" class="flex items-center gap-2" :class="busy === `built-in:${item.alias}` ? 'opacity-60' : ''">
            <span class="text-sm" :class="item.enabled ? '' : 'text-muted-foreground line-through'">{{ item.alias }}</span>
            <button
              type="button"
              role="switch"
              :aria-checked="item.enabled"
              :aria-label="t('skills.builtIn.toggle', { alias: item.alias, skill: entry.name })"
              :disabled="busy === `built-in:${item.alias}`"
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
              :class="item.enabled ? 'bg-primary' : 'bg-input'"
              data-testid="built-in-toggle"
              :data-alias="item.alias"
              @click="emit('toggle', item.alias, !item.enabled)"
            >
              <span class="size-4 rounded-full bg-card shadow-xs transition-transform duration-150 ease-snap" :class="item.enabled ? 'translate-x-4.5' : 'translate-x-0.5'" />
            </button>
          </li>
        </ul>
      </li>
    </ul>
    <p v-if="off > 0" class="text-xs text-muted-foreground" data-testid="built-in-off">{{ t('skills.builtIn.off', { count: off }) }}</p>
  </section>
</template>
