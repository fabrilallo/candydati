<script setup lang="ts">
import { CheckIcon, Trash2Icon } from '@lucide/vue'
import type { EraseTarget } from '@/composables/useCandidateRights'
import { confirmNameMatches } from '@/lib/gdpr-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * The serious confirmation of an erasure: exactly what goes and what stays, and the person's full name typed by hand
 * before the destructive button wakes up. Esc and the overlay stay available until the call starts.
 */
const props = defineProps<{ open: boolean; target: EraseTarget | null; name: string; pending: boolean; errorKey: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t } = useI18n()
const typed = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) typed.value = ''
  },
)
const matches = computed(() => confirmNameMatches(typed.value, props.name))
const title = computed(() =>
  props.target?.kind === 'application' ? t('gdpr.erase.titleApplication', { name: props.name, job: props.target.jobTitle }) : t('gdpr.erase.titleCandidate', { name: props.name }),
)
const deleted = computed<readonly string[]>(() => {
  const target = props.target
  if (!target) return []
  const shared = [t('gdpr.erase.deleted.cv'), t('gdpr.erase.deleted.notes'), t('gdpr.erase.deleted.messages'), t('gdpr.erase.deleted.activity')]
  if (target.kind === 'candidate') return [t('gdpr.erase.deleted.profile'), t('gdpr.erase.deleted.applications'), ...shared]
  return [t('gdpr.erase.deleted.application', { job: target.jobTitle }), ...shared, ...(target.last ? [t('gdpr.erase.deleted.profile')] : [])]
})
const submit = (): void => {
  if (matches.value && !props.pending) emit('confirm')
}
const guard = (event: Event): void => {
  if (props.pending) event.preventDefault()
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => (pending ? undefined : emit('update:open', value))">
    <DialogContent class="sm:max-w-lg" data-testid="erase-dialog" @interact-outside="guard" @escape-key-down="guard">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ t('gdpr.erase.irreversible') }}</DialogDescription>
      </DialogHeader>
      <form id="erase-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <div class="grid gap-4 rounded-lg border px-4 py-4">
          <section class="grid gap-2" aria-labelledby="erase-deleted">
            <h3 id="erase-deleted" class="text-sm font-semibold">{{ t('gdpr.erase.deletedTitle') }}</h3>
            <ul class="grid gap-1.5 text-sm" data-testid="erase-deleted">
              <li v-for="item in deleted" :key="item" class="flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ item }}</li>
            </ul>
            <p v-if="target?.kind === 'application' && target.last" class="text-sm text-muted-foreground" data-testid="erase-last">{{ t('gdpr.erase.lastApplication', { name }) }}</p>
          </section>
          <section class="grid gap-2 border-t pt-4" aria-labelledby="erase-kept">
            <h3 id="erase-kept" class="text-sm font-semibold">{{ t('gdpr.erase.keptTitle') }}</h3>
            <p class="flex items-start gap-2 text-sm" data-testid="erase-kept"><CheckIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('gdpr.erase.kept') }}</p>
          </section>
        </div>
        <FormField id="erase-name" :label="t('gdpr.erase.typeLabel', { name })" :hint="typed.trim() !== '' && !matches ? t('gdpr.erase.mismatch') : undefined">
          <template #default="{ describedBy }">
            <Input id="erase-name" v-model="typed" autocomplete="off" spellcheck="false" :aria-describedby="describedBy" :disabled="pending" data-testid="erase-name" />
          </template>
        </FormField>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="erase-form" variant="destructive" :disabled="!matches || pending" data-testid="erase-confirm">{{ pending ? t('gdpr.erase.erasing') : t('gdpr.erase.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
