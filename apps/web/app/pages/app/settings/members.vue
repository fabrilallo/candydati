<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { errorKeyOf } from '@/lib/auth-errors'
import { attempt } from '@/lib/load-result'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const api = useAuthApi()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('members.title') })

const { data, refresh } = await useAsyncData('organization-members', () => attempt(() => api.getFullOrganization()))
const organization = computed(() => data.value?.data ?? null)
const loadErrorKey = computed(() => data.value?.errorKey ?? null)
const role = computed(() => viewer.value?.role ?? null)
const canManageInvitations = computed(() => can(role.value, 'invitation:cancel'))
const busyId = ref<string | null>(null)

const cancelInvitation = async (id: string): Promise<void> => {
  busyId.value = id
  try {
    await api.cancelInvitation(id)
    toast.success(t('members.invitationCancelled'))
    await refresh()
  } catch (error) {
    toast.error(t(errorKeyOf(error)))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="grid gap-8">
    <header class="grid gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('members.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('members.subtitle', { organization: viewer?.organization?.name ?? '' }) }}</p>
    </header>

    <div v-if="loadErrorKey" class="grid gap-3">
      <FormAlert :message-key="loadErrorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>

    <template v-else-if="organization">
      <section aria-labelledby="members-title" class="grid gap-3">
        <h2 id="members-title" class="text-base font-semibold">{{ t('members.listTitle') }}</h2>
        <div class="rounded-lg border bg-card"><MembersTable :members="organization.members" :current-user-id="viewer?.user.id ?? ''" /></div>
      </section>

      <section v-if="canManageInvitations" aria-labelledby="pending-title" class="grid gap-3">
        <h2 id="pending-title" class="text-base font-semibold">{{ t('members.pendingTitle') }}</h2>
        <PendingInvitations :invitations="organization.invitations" :can-cancel="canManageInvitations" :busy-id="busyId" @cancel="cancelInvitation" />
      </section>

      <InviteForm :actor-role="role" @invited="() => refresh()" />
    </template>
  </div>
</template>
