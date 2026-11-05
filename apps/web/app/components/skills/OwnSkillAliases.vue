<script setup lang="ts">
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { SKILL_TERM_MAX, type SkillAliasDto } from '@candydati/domain'
import { validateSkillAliasForm, type SkillAliasForm } from '@/lib/skill-alias-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** The organization's own aliases: add one ("Go developer" is another way of writing "Go") and remove the ones it added. */
const props = defineProps<{ aliases: readonly SkillAliasDto[]; limit: number; busy: string | null; errorKey: string | null; skillNames: readonly string[] }>()
const emit = defineEmits<{ add: [form: SkillAliasForm, done: () => void]; remove: [id: string]; edit: [] }>()
const { t } = useI18n()
const form = ref<SkillAliasForm>({ skill: '', alias: '' })
const errors = ref<Partial<Record<keyof SkillAliasForm, string>>>({})
const adding = computed(() => props.busy === 'new')
const full = computed(() => props.aliases.length >= props.limit)
const submit = (): void => {
  errors.value = validateSkillAliasForm(form.value)
  if (Object.keys(errors.value).length > 0) return
  emit('add', { skill: form.value.skill.trim(), alias: form.value.alias.trim() }, () => {
    form.value = { skill: '', alias: '' }
  })
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="own-aliases-title" data-testid="own-aliases">
    <div class="grid gap-1">
      <h2 id="own-aliases-title" class="text-base font-semibold tracking-tight">{{ t('skills.own.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('skills.own.body') }}</p>
    </div>
    <form class="grid gap-3 rounded-xl panel p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-5" novalidate data-testid="alias-form" @submit.prevent="submit">
      <FormField id="alias-skill" :label="t('skills.own.skill')" :hint="t('skills.own.skillHint')" :error="errors.skill">
        <template #default="{ invalid, describedBy }">
          <Input id="alias-skill" v-model="form.skill" list="skill-names" :maxlength="SKILL_TERM_MAX" :aria-invalid="invalid" :aria-describedby="describedBy" autocomplete="off" data-testid="alias-skill" @input="emit('edit')" />
        </template>
      </FormField>
      <FormField id="alias-alias" :label="t('skills.own.alias')" :hint="t('skills.own.aliasHint')" :error="errors.alias">
        <template #default="{ invalid, describedBy }">
          <Input id="alias-alias" v-model="form.alias" :maxlength="SKILL_TERM_MAX" :aria-invalid="invalid" :aria-describedby="describedBy" autocomplete="off" data-testid="alias-alias" @input="emit('edit')" />
        </template>
      </FormField>
      <Button type="submit" :disabled="adding || full" data-testid="alias-add"><PlusIcon aria-hidden="true" />{{ adding ? t('skills.own.adding') : t('skills.own.add') }}</Button>
      <datalist id="skill-names"><option v-for="name in skillNames" :key="name" :value="name" /></datalist>
      <FormAlert v-if="errorKey" :message-key="errorKey" class="sm:col-span-3" />
    </form>
    <p v-if="aliases.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="aliases-empty">{{ t('skills.own.empty') }}</p>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel" :aria-label="t('skills.own.title')">
      <li v-for="item in aliases" :key="item.id" class="flex items-center justify-between gap-3 px-5 py-3 sm:px-6" :class="busy === item.id ? 'opacity-60' : ''" data-testid="alias-item">
        <p class="min-w-0 text-sm"><span class="font-medium">{{ item.alias }}</span><span class="px-2 text-muted-foreground" aria-hidden="true">→</span><span class="sr-only">{{ t('skills.own.countsAs') }}</span><span>{{ item.skill }}</span></p>
        <Button variant="ghost" size="icon-sm" :disabled="busy === item.id" :aria-label="t('skills.own.remove', { alias: item.alias })" data-testid="alias-remove" @click="emit('remove', item.id)"><Trash2Icon aria-hidden="true" /></Button>
      </li>
    </ul>
    <p class="text-xs text-muted-foreground">{{ t('skills.own.count', { count: aliases.length, limit }) }}</p>
  </section>
</template>
