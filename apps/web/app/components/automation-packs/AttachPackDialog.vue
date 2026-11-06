<script setup lang="ts">
import type { AttachPackResultDto, AutomationPackDto } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { attachPack } from '@/lib/automation-pack-api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Attach a pack to the job: its rules are copied onto the stages of their kind, as the rules of who attaches them.
 * Attaching a pack already attached brings its copies up to date (changes made to them here are replaced).
 */
const props = defineProps<{ open: boolean; jobId: string; packs: readonly AutomationPackDto[]; attachedIds: readonly string[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; attached: [result: AttachPackResultDto] }>()
const { t } = useI18n()
const request = useJobsApi()
const packId = ref('')
const busy = ref(false)
const errorKey = ref<string | null>(null)
watch(
  () => props.open,
  (open) => {
    if (!open) return
    packId.value = ''
    errorKey.value = null
  },
)
const again = computed(() => props.attachedIds.includes(packId.value))
const submit = async (): Promise<void> => {
  if (packId.value === '') {
    errorKey.value = 'automationPacks.errors.packRequired'
    return
  }
  busy.value = true
  errorKey.value = null
  try {
    emit('attached', await attachPack(request, props.jobId, packId.value))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="attach-pack-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('automationPacks.attach.title') }}</DialogTitle>
        <DialogDescription>{{ t('automationPacks.attach.description') }}</DialogDescription>
      </DialogHeader>
      <form id="attach-pack-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <p v-if="packs.length === 0" class="text-sm text-muted-foreground" data-testid="attach-pack-none">
          {{ t('automationPacks.attach.none') }} <NuxtLink to="/app/automations" class="underline underline-offset-4">{{ t('automationPacks.attach.goToPacks') }}</NuxtLink>
        </p>
        <FormField v-else id="attach-pack" :label="t('automationPacks.attach.pack')">
          <NativeSelect id="attach-pack" v-model="packId" data-testid="attach-pack-select">
            <option value="" disabled>{{ t('automationPacks.attach.placeholder') }}</option>
            <option v-for="pack in packs" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
          </NativeSelect>
        </FormField>
        <p v-if="again" class="text-sm text-muted-foreground" data-testid="attach-pack-again">{{ t('automationPacks.attach.again') }}</p>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="attach-pack-form" :disabled="busy || packs.length === 0" data-testid="attach-pack-submit">{{ again ? t('automationPacks.attach.update') : t('automationPacks.attach.submit') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
