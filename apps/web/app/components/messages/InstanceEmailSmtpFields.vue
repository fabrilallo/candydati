<script setup lang="ts">
import type { InstanceEmailErrors, InstanceEmailForm } from '@/lib/instance-email-view'
import { Input } from '@/components/ui/input'

/** SMTP server, port, TLS from the first byte, credentials. The stored password is never shown, only that it exists. */
defineProps<{ form: InstanceEmailForm; errors: InstanceEmailErrors; hasPassword: boolean }>()
const emit = defineEmits<{ set: [field: 'host' | 'secure' | 'user' | 'password', value: string | boolean]; port: [value: string] }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-5">
    <div class="grid gap-5 sm:grid-cols-[1fr_8rem]">
      <FormField id="smtp-host" :label="t('instanceEmail.form.host')" :error="errors.host">
        <template #default="{ invalid, describedBy }">
          <Input id="smtp-host" autocomplete="off" spellcheck="false" :model-value="form.host" :placeholder="t('instanceEmail.form.hostPlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="smtp-host" @update:model-value="emit('set', 'host', String($event))" />
        </template>
      </FormField>
      <FormField id="smtp-port" :label="t('instanceEmail.form.port')" :error="errors.port">
        <template #default="{ invalid, describedBy }">
          <Input id="smtp-port" inputmode="numeric" autocomplete="off" :model-value="form.port" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="smtp-port" @update:model-value="emit('port', String($event))" />
        </template>
      </FormField>
    </div>
    <p class="-mt-3 text-xs text-muted-foreground">{{ t('instanceEmail.form.portHint') }}</p>
    <label class="flex items-start gap-3 text-sm">
      <input type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :checked="form.secure" aria-describedby="smtp-secure-hint" data-testid="smtp-secure" @change="emit('set', 'secure', ($event.target as HTMLInputElement).checked)">
      <span class="grid gap-0.5">
        <span class="font-medium">{{ t('instanceEmail.form.secure') }}</span>
        <span id="smtp-secure-hint" class="text-xs text-muted-foreground">{{ t('instanceEmail.form.secureHint') }}</span>
      </span>
    </label>
    <div class="grid gap-5 sm:grid-cols-2">
      <FormField id="smtp-user" :label="t('instanceEmail.form.user')" :error="errors.user">
        <template #default="{ invalid, describedBy }">
          <Input id="smtp-user" autocomplete="off" spellcheck="false" :model-value="form.user" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="smtp-user" @update:model-value="emit('set', 'user', String($event))" />
        </template>
      </FormField>
      <FormField id="smtp-password" :label="t('instanceEmail.form.password')" :error="errors.password">
        <template #default="{ invalid, describedBy }">
          <Input id="smtp-password" type="password" autocomplete="off" :model-value="form.password" :placeholder="hasPassword ? t('instanceEmail.form.secretKept') : undefined" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="smtp-password" @update:model-value="emit('set', 'password', String($event))" />
        </template>
      </FormField>
    </div>
  </div>
</template>
