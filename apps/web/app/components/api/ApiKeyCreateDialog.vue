<script setup lang="ts">
import { ShieldCheckIcon, TriangleAlertIcon } from '@lucide/vue'
import { API_KEY_NAME_MAX, type Permission } from '@tt/domain'
import type { ApiKeyCreateInput } from '@/lib/api-key-api'
import { EXPIRY_CHOICES, expiryDate, scopeGroups, scopeLabelKey, toggleScope, validateKeyForm, type KeyForm, type KeyFormErrors } from '@/lib/api-keys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * New key: name, scopes grouped by area (only what the creator holds and a machine may have), optional expiry.
 * Once created, the same dialog shows the secret ONCE with copy; it cannot be dismissed by accident until the person
 * ticks that they stored it.
 */
const props = defineProps<{ open: boolean; busy: boolean; errorKey: string | null; secret: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; create: [input: ApiKeyCreateInput]; done: [] }>()
const { t } = useI18n()
const { viewer } = useViewer()
const groups = computed(() => scopeGroups(viewer.value?.role ?? null))
const blank = (): KeyForm => ({ name: '', scopes: [], expiry: 'never' })
const form = ref<KeyForm>(blank())
const errors = ref<KeyFormErrors>({})
const copied = ref(false)
const copyFailed = ref(false)
const stored = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = blank()
    errors.value = {}
    copied.value = false
    copyFailed.value = false
    stored.value = false
  },
)
const toggle = (scope: Permission): void => {
  form.value = { ...form.value, scopes: toggleScope(form.value.scopes, scope) }
}
const submit = (): void => {
  errors.value = validateKeyForm(form.value)
  if (Object.keys(errors.value).length > 0) return
  emit('create', { name: form.value.name.trim(), scopes: form.value.scopes, expiresAt: expiryDate(form.value.expiry, new Date()) })
}
const copy = async (): Promise<void> => {
  if (!props.secret) return
  try {
    await navigator.clipboard.writeText(props.secret)
    copied.value = true
    copyFailed.value = false
  } catch (error) {
    copyFailed.value = true
    console.error('[api-keys] clipboard refused', error instanceof Error ? error.message : error)
  }
}
const guard = (event: Event): void => {
  if (props.secret) event.preventDefault()
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => (secret ? undefined : emit('update:open', value))">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" :show-close-button="!secret" data-testid="api-key-dialog" @interact-outside="guard" @escape-key-down="guard">
      <template v-if="secret">
        <DialogHeader>
          <DialogTitle>{{ t('apiKeys.secret.title') }}</DialogTitle>
          <DialogDescription>{{ t('apiKeys.secret.label') }}</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3">
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm select-all" data-testid="api-key-secret">{{ secret }}</code>
            <Button type="button" variant="outline" size="sm" data-testid="api-key-copy" @click="copy">{{ copied ? t('apiKeys.secret.copied') : t('apiKeys.secret.copy') }}</Button>
          </div>
          <p v-if="copyFailed" class="text-xs font-medium text-destructive" role="alert">{{ t('apiKeys.secret.copyFailed') }}</p>
          <p class="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning" role="alert">
            <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('apiKeys.secret.warning') }}
          </p>
          <label class="flex items-start gap-2.5 text-sm">
            <input v-model="stored" type="checkbox" class="mt-0.5 size-4 accent-primary" data-testid="api-key-stored">
            <span>{{ t('apiKeys.secret.confirm') }}</span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" :disabled="!stored" data-testid="api-key-done" @click="emit('done')">{{ t('apiKeys.secret.done') }}</Button>
        </DialogFooter>
      </template>
      <template v-else>
        <DialogHeader>
          <DialogTitle>{{ t('apiKeys.newTitle') }}</DialogTitle>
          <DialogDescription>{{ t('apiKeys.newDescription') }}</DialogDescription>
        </DialogHeader>
        <form id="api-key-form" class="grid gap-5" novalidate @submit.prevent="submit">
          <FormField id="api-key-name" :label="t('apiKeys.fields.name')" :hint="t('apiKeys.fields.nameHint')" :error="errors.name">
            <template #default="{ invalid, describedBy }">
              <Input id="api-key-name" v-model="form.name" :maxlength="API_KEY_NAME_MAX" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="api-key-name" />
            </template>
          </FormField>
          <fieldset class="grid gap-4" :aria-describedby="errors.scopes ? 'api-key-scopes-error' : 'api-key-scopes-hint'">
            <legend class="mb-1 text-sm font-medium">{{ t('apiKeys.fields.scopes') }}</legend>
            <p id="api-key-scopes-hint" class="text-xs text-muted-foreground">{{ t('apiKeys.fields.scopesHint') }}</p>
            <div v-for="group in groups" :key="group.area" class="grid gap-2" :data-testid="`api-key-area-${group.area}`">
              <p class="text-xs font-medium text-muted-foreground">{{ t(`apiKeys.areas.${group.area}`) }}</p>
              <label v-for="scope in group.scopes" :key="scope" class="flex items-start gap-2.5 text-sm">
                <input type="checkbox" class="mt-0.5 size-4 accent-primary" :checked="form.scopes.includes(scope)" :data-testid="`api-key-scope-${scope}`" @change="toggle(scope)">
                <span>{{ t(scopeLabelKey(scope)) }}</span>
              </label>
            </div>
            <p v-if="errors.scopes" id="api-key-scopes-error" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.scopes) }}</p>
            <p class="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground" data-testid="api-key-withheld">
              <ShieldCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('apiKeys.withheld') }}
            </p>
          </fieldset>
          <div class="grid gap-1.5">
            <Label for="api-key-expiry">{{ t('apiKeys.fields.expiry') }}</Label>
            <NativeSelect id="api-key-expiry" :model-value="form.expiry" data-testid="api-key-expiry" @update:model-value="(value) => (form = { ...form, expiry: value as KeyForm['expiry'] })">
              <option v-for="choice in EXPIRY_CHOICES" :key="choice" :value="choice">{{ t(`apiKeys.expiry.${choice}`) }}</option>
            </NativeSelect>
          </div>
          <FormAlert :message-key="errorKey" />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
          <Button type="submit" form="api-key-form" :disabled="busy" data-testid="api-key-create">{{ busy ? t('apiKeys.creating') : t('apiKeys.create') }}</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
