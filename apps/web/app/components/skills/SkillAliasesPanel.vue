<script setup lang="ts">
import type { SkillAliasForm } from '@/lib/skill-alias-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Skill aliases of the organization: its own, and the built-in ones with a switch each. A filter on declared criteria reads both. */
const { t } = useI18n()
const skills = useSkillAliases()
const add = async (form: SkillAliasForm, done: () => void): Promise<void> => {
  if (await skills.add(form)) done()
}
const skillNames = computed(() => [...new Set([...(skills.overview.value?.builtIn.map((entry) => entry.name) ?? []), ...(skills.overview.value?.own.map((alias) => alias.skill) ?? [])])])
</script>

<template>
  <div v-if="skills.errorKey.value" class="grid gap-3">
    <FormAlert :message-key="skills.errorKey.value" />
    <div><Button variant="outline" @click="() => skills.refresh()">{{ t('common.retry') }}</Button></div>
  </div>
  <div v-else-if="!skills.overview.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-40 w-full" /></div>
  <div v-else class="grid gap-10">
    <OwnSkillAliases
      :aliases="skills.overview.value.own"
      :limit="skills.overview.value.limit"
      :busy="skills.busy.value"
      :error-key="skills.addErrorKey.value"
      :skill-names="skillNames"
      @add="add"
      @remove="skills.remove"
      @edit="skills.clearError"
    />
    <BuiltInSkillAliases :entries="skills.overview.value.builtIn" :busy="skills.busy.value" @toggle="skills.setBuiltIn" />
  </div>
</template>
