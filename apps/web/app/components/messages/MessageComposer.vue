<script setup lang="ts">
import { SendIcon } from '@lucide/vue'
import { templateForKind, templateGroups } from '@/lib/message-view'
import { BULK_MESSAGE_MAX, type EmailTemplateKind } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Writes one message to one or many applications: template (or none), subject, body with variables, the live preview
 * for one candidate, and "Invia" behind a confirmation that names who receives it (PLAN §6: a person always
 * confirms). With `initialKind` the matching template is filled in, with `initialDraft` that text; never sent.
 */
const props = withDefaults(
  defineProps<{
    applicationIds: readonly string[]
    /** Who the preview is rendered for. */
    previewName: string
    /** Named in the confirmation of a single send. */
    recipient?: string
    bulk?: boolean
    initialKind?: EmailTemplateKind | null
    /** Text to start from (a draft of the assistant): filled in once, never sent without the person. */
    initialDraft?: { readonly subject: string; readonly body: string } | null
    skippable?: boolean
    idPrefix: string
  }>(),
  { recipient: '', bulk: false, initialKind: null, initialDraft: null, skippable: false },
)
const emit = defineEmits<{ sent: [count: number]; skip: [] }>()
const { t } = useI18n()
const library = useEmailTemplates()
const composer = useMessageComposer({ applicationIds: () => props.applicationIds, previewFor: () => props.applicationIds[0] ?? null })
const groups = computed(() => templateGroups(library.templates.value ?? []))
const selectId = computed(() => `${props.idPrefix}-template`)
const confirmOpen = ref(false)

const choose = (id: string): void => {
  composer.applyTemplate(library.templates.value?.find((item) => item.id === id) ?? null)
}
const prefilled = ref(props.initialDraft !== null)
if (props.initialDraft) {
  composer.subject.value = props.initialDraft.subject
  composer.body.value = props.initialDraft.body
}
watch(
  [() => library.templates.value, () => props.initialKind],
  ([templates, kind]) => {
    if (prefilled.value || !templates || !kind) return
    prefilled.value = true
    composer.applyTemplate(templateForKind(templates, kind))
  },
  { immediate: true },
)

const confirmBody = computed(() =>
  props.bulk ? t('messages.confirm.bulkBody', { count: props.applicationIds.length }, props.applicationIds.length) : t('messages.confirm.singleBody', { recipient: props.recipient }),
)
const ask = (): void => {
  if (composer.ready.value) confirmOpen.value = true
}
const confirm = async (): Promise<void> => {
  const queued = await composer.send()
  if (queued === null) return
  confirmOpen.value = false
  composer.reset()
  emit('sent', queued)
}
</script>

<template>
  <form class="grid gap-5" novalidate data-testid="message-composer" @submit.prevent="ask">
    <div class="grid gap-1.5">
      <Label :for="selectId">{{ t('messages.composer.template') }}</Label>
      <NativeSelect :id="selectId" :model-value="composer.templateId.value ?? ''" :disabled="!library.templates.value" data-testid="composer-template" @update:model-value="choose">
        <option value="">{{ t('messages.composer.noTemplate') }}</option>
        <optgroup v-for="group in groups" :key="group.kind" :label="t(`emailTemplates.kinds.${group.kind}`)">
          <option v-for="item in group.templates" :key="item.id" :value="item.id">{{ item.name }}</option>
        </optgroup>
      </NativeSelect>
      <p v-if="library.errorKey.value" class="text-xs text-muted-foreground" data-testid="templates-unavailable">{{ t('messages.composer.templatesUnavailable') }}</p>
    </div>

    <TemplateFields v-model:subject="composer.subject.value" v-model:body="composer.body.value" :id-prefix="idPrefix" :unknown="composer.unknown.value" :disabled="composer.sending.value" />

    <MessagePreview
      :title="t('messages.preview.for', { name: previewName })"
      :subject="composer.preview.value?.subject ?? null"
      :body="composer.preview.value?.body ?? null"
      :unknown="composer.unknown.value"
      :loading="composer.previewing.value"
      :stale="composer.stale.value"
      :error-key="composer.previewErrorKey.value"
    />

    <p v-if="composer.tooMany.value" role="alert" class="text-sm text-destructive" data-testid="too-many">{{ t('messages.composer.tooMany', { max: BULK_MESSAGE_MAX }) }}</p>
    <FormAlert :message-key="composer.sendErrorKey.value" />
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-md text-xs text-muted-foreground">{{ t('messages.composer.replyHint') }}</p>
      <div class="flex items-center gap-2">
        <Button v-if="skippable" type="button" variant="ghost" data-testid="composer-skip" @click="emit('skip')">{{ t('messages.composer.skip') }}</Button>
        <Button type="submit" :disabled="!composer.ready.value || composer.sending.value" data-testid="composer-send"><SendIcon aria-hidden="true" />{{ t('messages.composer.send') }}</Button>
      </div>
    </div>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('messages.confirm.title')"
      :body="confirmBody"
      :confirm-label="bulk ? t('messages.confirm.bulkAction', { count: applicationIds.length }, applicationIds.length) : t('messages.confirm.action')"
      :pending="composer.sending.value"
      :error-key="composer.sendErrorKey.value"
      @confirm="confirm"
    />
  </form>
</template>
