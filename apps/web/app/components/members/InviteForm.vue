<script setup lang="ts">
import type { Role } from '@tt/domain'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { assignableRoles, defaultInviteRole } from '@/lib/permissions-ui'
import { inviteSchema } from '@/lib/schemas'

const props = defineProps<{ actorRole: Role | null }>()
const emit = defineEmits<{ invited: [email: string] }>()
const { t } = useI18n()
const api = useAuthApi()

const roles = computed(() => assignableRoles(props.actorRole))
const form = useZodForm(inviteSchema, { email: '', role: defaultInviteRole(props.actorRole) ?? 'recruiter' })

const onSubmit = async (): Promise<void> => {
  let invitedEmail: string | null = null
  await form.submit(async (data) => {
    await api.inviteMember(data)
    invitedEmail = data.email
  })
  if (invitedEmail === null) return
  toast.success(t('members.invited', { email: invitedEmail }))
  form.setField('email', '')
  emit('invited', invitedEmail)
}
</script>

<template>
  <section aria-labelledby="invite-title" class="grid gap-4 rounded-xl border bg-card p-5">
    <div class="grid gap-1">
      <h2 id="invite-title" class="text-base font-semibold">{{ t('members.inviteTitle') }}</h2>
      <p class="text-sm text-muted-foreground">{{ roles.length ? t('members.inviteHint') : t('members.noInvitePermission') }}</p>
    </div>
    <form v-if="roles.length" class="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-start" novalidate data-testid="invite-form" @submit.prevent="onSubmit">
      <FormField id="invite-email" :label="t('members.email')" :error="form.errors.value.email">
        <template #default="{ invalid, describedBy }">
          <Input id="invite-email" type="email" autocomplete="off" inputmode="email" :model-value="form.values.value.email" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form.setField('email', String($event))" />
        </template>
      </FormField>
      <FormField id="invite-role" :label="t('members.role')" :error="form.errors.value.role">
        <template #default="{ invalid, describedBy }">
          <RoleSelect id="invite-role" :model-value="form.values.value.role" :roles="roles" :invalid="invalid" :described-by="describedBy" @update:model-value="form.setField('role', $event as Role)" />
        </template>
      </FormField>
      <Button type="submit" class="sm:mt-[1.375rem]" :disabled="form.pending.value">
        {{ form.pending.value ? t('members.inviting') : t('members.invite') }}
      </Button>
      <div class="sm:col-span-3"><FormAlert :message-key="form.submitError.value" /></div>
    </form>
  </section>
</template>
