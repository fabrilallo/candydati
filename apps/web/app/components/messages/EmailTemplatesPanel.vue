<script setup lang="ts">
import type { EmailTemplateDto } from '@candydati/domain'
import { PlusIcon } from '@lucide/vue'
import type { TemplateInput } from '@/lib/message-api'
import { templateGroups } from '@/lib/message-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Templates grouped by kind on the left, the one being edited on the right (one column on a phone). */
const { t } = useI18n()
const lib = useEmailTemplates()
const groups = computed(() => templateGroups(lib.templates.value ?? []))
/** Id chosen by the user, `new` for a new custom template; until then (or once it is gone) the first template. */
const chosenId = ref<string | null>(null)
const selectedId = computed<string>(() => {
  const templates = lib.templates.value ?? []
  const chosen = chosenId.value
  if (chosen === 'new' || templates.some((item) => item.id === chosen)) return chosen ?? 'new'
  return templates[0]?.id ?? 'new'
})
const selected = computed<EmailTemplateDto | null>(() => lib.templates.value?.find((item) => item.id === selectedId.value) ?? null)
const pick = (id: string): void => {
  lib.clearError()
  chosenId.value = id
}
const save = async (input: TemplateInput): Promise<void> => {
  const saved = await lib.save(selected.value, input)
  if (saved) chosenId.value = saved.id
}
const remove = async (): Promise<void> => {
  const template = selected.value
  if (template && (await lib.remove(template)) && template.kind === 'custom') chosenId.value = null
}
</script>

<template>
  <div class="grid gap-6">
    <div v-if="lib.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="lib.errorKey.value" />
      <div><Button variant="outline" @click="() => lib.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!lib.templates.value" class="grid gap-4 lg:grid-cols-[16rem_1fr]" aria-busy="true" data-testid="templates-loading">
      <Skeleton class="h-64 w-full rounded-xl" />
      <Skeleton class="h-96 w-full rounded-xl" />
    </div>
    <div v-else class="grid items-start gap-6 lg:grid-cols-[16rem_1fr]">
      <nav class="grid gap-5" :aria-label="t('emailTemplates.listLabel')" data-testid="template-list">
        <div v-for="group in groups" :key="group.kind" class="grid gap-1">
          <h2 class="px-2.5 text-xs font-medium text-muted-foreground">{{ t(`emailTemplates.kinds.${group.kind}`) }}</h2>
          <ul class="grid gap-0.5">
            <li v-for="item in group.templates" :key="item.id">
              <button
                type="button"
                class="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35"
                :class="selectedId === item.id ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-muted'"
                :aria-current="selectedId === item.id ? 'true' : undefined"
                :data-testid="`template-item-${item.id}`"
                @click="pick(item.id)"
              >
                <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
                <span v-if="item.isDefault" class="text-xs text-muted-foreground">{{ t('emailTemplates.defaultShort') }}</span>
              </button>
            </li>
          </ul>
        </div>
        <div><Button variant="outline" size="sm" data-testid="template-new" @click="pick('new')"><PlusIcon aria-hidden="true" />{{ t('emailTemplates.new') }}</Button></div>
      </nav>
      <section class="rounded-xl border bg-card px-5 py-5 sm:px-6" :aria-label="selected?.name ?? t('emailTemplates.new')">
        <EmailTemplateEditor :key="`${selectedId}-${selected?.updatedAt ?? ''}`" :template="selected" :busy="lib.busy.value" :error-key="lib.saveErrorKey.value" @save="save" @remove="remove" />
      </section>
    </div>
  </div>
</template>
