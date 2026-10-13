<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OrganizationSummary } from '@/lib/auth-api'
import { createOrganizationSchema } from '@/lib/schemas'
import { slugify } from '@tt/domain'

const emit = defineEmits<{ created: [organization: OrganizationSummary] }>()
const { t } = useI18n()
const api = useAuthApi()

const form = useZodForm(createOrganizationSchema, { name: '', slug: '' })
/** Once the user edits the slug by hand, the name stops overwriting it. */
const slugEdited = ref(false)

const onName = (value: string | number): void => {
  const name = String(value)
  form.setField('name', name)
  if (!slugEdited.value) form.setField('slug', slugify(name))
}
const onSlug = (value: string | number): void => {
  slugEdited.value = true
  form.setField('slug', String(value))
}

const onSubmit = async (): Promise<void> => {
  let created: OrganizationSummary | null = null
  await form.submit(async (data) => {
    created = await api.createOrganization(data)
  })
  if (created) emit('created', created)
}
</script>

<template>
  <form class="grid gap-5" novalidate @submit.prevent="onSubmit">
    <FormField id="org-name" :label="t('onboarding.name')" :error="form.errors.value.name">
      <template #default="{ invalid, describedBy }">
        <Input id="org-name" autocomplete="organization" :placeholder="t('onboarding.namePlaceholder')" :model-value="form.values.value.name" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="onName" />
      </template>
    </FormField>
    <FormField id="org-slug" :label="t('onboarding.slug')" :error="form.errors.value.slug" :hint="t('onboarding.slugHint')">
      <template #default="{ invalid, describedBy }">
        <Input id="org-slug" autocapitalize="none" spellcheck="false" class="font-mono" :model-value="form.values.value.slug" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="onSlug" />
      </template>
    </FormField>
    <FormAlert :message-key="form.submitError.value" />
    <Button type="submit" size="lg" class="mt-1 w-full" :disabled="form.pending.value">
      {{ form.pending.value ? t('onboarding.submitting') : t('onboarding.submit') }}
    </Button>
  </form>
</template>
