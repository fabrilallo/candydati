<script setup lang="ts">
import type { TemplateInput } from '@/lib/message-api'
import { sampleValues } from '@/lib/message-view'
import { EMAIL_TEMPLATE_NAME_MAX, emailTemplateInputSchema, findUnknownVariables, renderTemplate, type EmailTemplateDto } from '@tt/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * One template: name, subject and body with the variable picker, and a preview filled with a sample candidate.
 * An edited default can go back to the original text; a custom template can be deleted. `template` null = new custom.
 */
const props = defineProps<{ template: EmailTemplateDto | null; busy: boolean; errorKey: string | null }>()
const emit = defineEmits<{ save: [input: TemplateInput]; remove: [] }>()
const { t } = useI18n()
const { viewer } = useViewer()
const config = useRuntimeConfig()
const name = ref(props.template?.name ?? '')
const subject = ref(props.template?.subject ?? '')
const body = ref(props.template?.body ?? '')
const kind = computed(() => props.template?.kind ?? 'custom')
const unknown = computed(() => findUnknownVariables(subject.value, body.value))
const input = computed(() => ({ name: name.value.trim(), kind: kind.value, subject: subject.value, body: body.value }))
const valid = computed(() => emailTemplateInputSchema.safeParse(input.value).success && unknown.value.length === 0)
const sample = computed(() =>
  sampleValues({
    firstName: t('emailTemplates.sample.firstName'),
    lastName: t('emailTemplates.sample.lastName'),
    jobTitle: t('emailTemplates.sample.jobTitle'),
    stageName: t('emailTemplates.sample.stage'),
    organizationName: viewer.value?.organization?.name ?? '',
    careersUrl: `${String(config.public.siteUrl).replace(/\/$/, '')}/careers/${viewer.value?.organization?.slug ?? ''}`,
  }),
)
const rendered = computed(() => ({ subject: renderTemplate(subject.value, sample.value).text, body: renderTemplate(body.value, sample.value).text }))
const canRestore = computed(() => props.template !== null && !props.template.isDefault && props.template.kind !== 'custom')
const canDelete = computed(() => props.template !== null && props.template.kind === 'custom')
const confirmOpen = ref(false)
const save = (): void => {
  if (valid.value) emit('save', input.value)
}
const confirmRemove = (): void => {
  confirmOpen.value = false
  emit('remove')
}
</script>

<template>
  <form class="grid gap-5" novalidate data-testid="template-editor" @submit.prevent="save">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{{ t(`emailTemplates.kinds.${kind}`) }}</Badge>
      <Badge v-if="template?.isDefault" variant="outline" data-testid="template-default">{{ t('emailTemplates.default') }}</Badge>
      <p class="text-xs text-muted-foreground">{{ t(`emailTemplates.kindHints.${kind}`) }}</p>
    </div>
    <FormField id="template-name" :label="t('emailTemplates.name')">
      <Input id="template-name" v-model="name" :maxlength="EMAIL_TEMPLATE_NAME_MAX" data-testid="template-name" />
    </FormField>
    <TemplateFields v-model:subject="subject" v-model:body="body" id-prefix="template" :unknown="unknown" :disabled="busy" :body-rows="12" />
    <MessagePreview :title="t('emailTemplates.sample.title')" :subject="rendered.subject" :body="rendered.body" :unknown="unknown" empty-key="emailTemplates.sample.empty" />
    <FormAlert :message-key="errorKey" />
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Button v-if="canRestore" type="button" variant="outline" :disabled="busy" data-testid="template-restore" @click="confirmOpen = true">{{ t('emailTemplates.restore') }}</Button>
      <Button v-if="canDelete" type="button" variant="outline" :disabled="busy" data-testid="template-delete" @click="confirmOpen = true">{{ t('emailTemplates.delete') }}</Button>
      <Button type="submit" :disabled="busy || !valid" data-testid="template-save">{{ busy ? t('emailTemplates.saving') : t('emailTemplates.save') }}</Button>
    </div>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="canDelete ? t('emailTemplates.confirmDelete.title') : t('emailTemplates.confirmRestore.title')"
      :body="canDelete ? t('emailTemplates.confirmDelete.body', { name: template?.name ?? '' }) : t('emailTemplates.confirmRestore.body')"
      :confirm-label="canDelete ? t('emailTemplates.delete') : t('emailTemplates.restore')"
      :destructive="canDelete"
      :pending="busy"
      @confirm="confirmRemove"
    />
  </form>
</template>
