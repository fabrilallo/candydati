<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { errorKeyOf } from '@/lib/auth-errors'
import { attempt } from '@/lib/load-result'
import { parseMemberRole } from '@/lib/permissions-ui'

const { t } = useI18n()
const route = useRoute()
const api = useAuthApi()
const { refresh } = useViewer()

const invitationId = String(route.params.id)
const { data } = await useAsyncData(`invitation-${invitationId}`, () => attempt(() => api.getInvitation(invitationId)))
const invitation = computed(() => data.value?.data ?? null)
const pending = computed(() => invitation.value?.status === 'pending')
useSeoMeta({
  title: () =>
    invitation.value ? t('invitation.title', { organization: invitation.value.organizationName }) : t('invitation.loadFailed'),
})
const roleLabel = computed(() => {
  const role = parseMemberRole(invitation.value?.role)
  return role ? t(`roles.${role}`) : ''
})
const busy = ref(false)
const actionErrorKey = ref<string | null>(null)

const respond = async (accept: boolean): Promise<void> => {
  busy.value = true
  actionErrorKey.value = null
  try {
    if (accept) await api.acceptInvitation(invitationId)
    else await api.rejectInvitation(invitationId)
  } catch (error) {
    actionErrorKey.value = errorKeyOf(error)
    busy.value = false
    return
  }
  toast.success(accept ? t('invitation.accepted', { organization: invitation.value?.organizationName ?? '' }) : t('invitation.rejected'))
  await refresh()
  await navigateTo(accept ? '/app' : '/onboarding')
}
</script>

<template>
  <div class="grid gap-6">
    <template v-if="invitation">
      <div class="grid gap-1.5">
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('invitation.title', { organization: invitation.organizationName }) }}</h1>
        <p v-if="roleLabel" class="text-sm text-muted-foreground">{{ t('invitation.subtitle', { role: roleLabel }) }}</p>
        <p v-if="invitation.inviterEmail" class="text-sm text-muted-foreground">{{ t('invitation.from', { inviter: invitation.inviterEmail }) }}</p>
        <p class="text-sm text-muted-foreground">{{ t('invitation.forEmail', { email: invitation.email }) }}</p>
      </div>
      <FormAlert :message-key="actionErrorKey" />
      <div v-if="pending" class="flex flex-wrap gap-3">
        <Button :disabled="busy" @click="respond(true)">{{ t('invitation.accept') }}</Button>
        <Button variant="outline" :disabled="busy" @click="respond(false)">{{ t('invitation.reject') }}</Button>
      </div>
      <p v-else class="text-sm text-muted-foreground">{{ t('invitation.notPending', { status: invitation.status }) }}</p>
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('invitation.loadFailed') }}</h1>
      <FormAlert :message-key="data?.errorKey ?? 'errors.generic'" />
      <div><Button variant="outline" as-child><NuxtLink to="/app">{{ t('invitation.goToApp') }}</NuxtLink></Button></div>
    </template>
  </div>
</template>
