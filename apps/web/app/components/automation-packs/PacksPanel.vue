<script setup lang="ts">
import { ArrowRightIcon, PackageIcon, PlusIcon } from '@lucide/vue'
import type { AutomationPackInput } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The automation packs of the organization: each one a set of rules written once, by kind of stage, to attach to any
 * job. Attaching copies the rules into the job, as the rules of who attaches them.
 */
const { t } = useI18n()
const packs = useAutomationPacks()
const creating = ref(false)
const save = async (input: AutomationPackInput): Promise<void> => {
  const fresh = await packs.save(null, input)
  if (fresh) {
    creating.value = false
    await navigateTo(`/app/automations/${fresh.id}`)
  }
}
const open = (): void => {
  packs.clearError()
  creating.value = true
}
</script>

<template>
  <div class="grid gap-6" data-testid="packs-panel">
    <div class="flex justify-end">
      <Button data-testid="pack-add" @click="open"><PlusIcon aria-hidden="true" />{{ t('automationPacks.add') }}</Button>
    </div>
    <div v-if="packs.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="packs.errorKey.value" />
      <div><Button variant="outline" @click="() => packs.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!packs.packs.value" class="grid gap-4" aria-busy="true"><Skeleton class="h-20 w-full" /><Skeleton class="h-20 w-full" /></div>
    <section v-else-if="packs.packs.value.length === 0" class="grid gap-5 rounded-xl panel px-6 py-10 sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:px-8" data-testid="packs-empty">
      <span class="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><PackageIcon class="size-5" /></span>
      <div class="grid max-w-xl gap-1.5">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('automationPacks.emptyTitle') }}</h2>
        <p class="text-[0.9375rem] text-muted-foreground">{{ t('automationPacks.emptyBody') }}</p>
      </div>
    </section>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel">
      <li v-for="pack in packs.packs.value" :key="pack.id" class="relative flex items-center gap-4 px-5 py-4 transition-colors duration-150 ease-snap hover:bg-muted/50 sm:px-6" data-testid="pack-row">
        <div class="grid min-w-0 flex-1 gap-1">
          <NuxtLink :to="`/app/automations/${pack.id}`" class="font-medium outline-none after:absolute after:inset-0 focus-visible:underline" data-testid="pack-link">{{ pack.name }}</NuxtLink>
          <p v-if="pack.description" class="text-sm text-pretty text-muted-foreground">{{ pack.description }}</p>
          <p class="text-xs text-muted-foreground" data-testid="pack-meta">
            {{ t('automationPacks.ruleCount', { count: pack.ruleCount }, pack.ruleCount) }} · {{ t('automationPacks.templateCount', { count: pack.templateIds.length }, pack.templateIds.length) }}
          </p>
        </div>
        <ArrowRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </li>
    </ul>
    <PackDialog v-model:open="creating" :pack="null" :busy="packs.busy.value !== null" :error-key="packs.saveErrorKey.value" @save="save" />
  </div>
</template>
