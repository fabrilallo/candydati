<script setup lang="ts">
import { UsersIcon } from '@lucide/vue'
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

const { data, refresh } = await useFreshAsyncData('organization-members', () => attempt(() => api.getFullOrganization()))
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
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('members.title') }]">
  <div class="grid gap-8">
    <PageHeader :title="t('members.title')" :description="t('members.subtitle', { organization: viewer?.organization?.name ?? '' })" :icon="UsersIcon" />

    <div v-if="loadErrorKey" class="grid gap-3">
      <FormAlert :message-key="loadErrorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>

    <div v-else-if="organization" class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="grid gap-8">
        <section aria-labelledby="members-title" class="grid gap-3">
          <h2 id="members-title" class="flex items-baseline gap-2 text-base font-semibold tracking-tight">
            {{ t('members.listTitle') }}
            <span class="figure text-sm font-normal text-muted-foreground">{{ organization.members.length }}</span>
          </h2>
          <MembersTable :members="organization.members" :current-user-id="viewer?.user.id ?? ''" />
        </section>

        <section v-if="canManageInvitations" aria-labelledby="pending-title" class="grid gap-3">
          <h2 id="pending-title" class="flex items-baseline gap-2 text-base font-semibold tracking-tight">
            {{ t('members.pendingTitle') }}
            <span v-if="organization.invitations.length" class="figure text-sm font-normal text-muted-foreground">{{ organization.invitations.length }}</span>
          </h2>
          <PendingInvitations :invitations="organization.invitations" :can-cancel="canManageInvitations" :busy-id="busyId" @cancel="cancelInvitation" />
        </section>
      </div>

      <div class="lg:sticky lg:top-20 lg:order-none">
        <InviteForm :actor-role="role" @invited="() => refresh()" />
      </div>
    </div>
  </div>
  </AppPage>
</template>
