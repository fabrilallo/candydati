<script setup lang="ts">
import { InfoIcon, UserPlusIcon, UserSearchIcon } from '@lucide/vue'
import type { SourcedContactDto, SourcedContactInput } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The people found outside Candydati for this job: contacts, not candidates. Each says where it came from and what fits
 * the job (never a score); the notice text goes into the first message; nobody written to is erased after 30 days.
 */
const props = defineProps<{ jobId: string }>()
const { t } = useI18n()
const sourcing = useSourcedContacts(props.jobId)
const now = useState('sourcing-now', () => Date.now())
const nowDate = computed(() => new Date(now.value))
const nameOf = (contact: SourcedContactDto | null): string => (contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : '')

const adding = ref(false)
const save = async (input: SourcedContactInput): Promise<void> => {
  if (await sourcing.add(input)) adding.value = false
}

const noticeFor = ref<SourcedContactDto | null>(null)
const noticeText = ref<string | null>(null)
const noticeOpen = computed({
  get: () => noticeFor.value !== null,
  set: (open: boolean) => {
    if (!open) noticeFor.value = null
  },
})
const openNotice = async (contact: SourcedContactDto): Promise<void> => {
  noticeText.value = null
  noticeFor.value = contact
  noticeText.value = (await sourcing.notice(contact))?.text ?? null
}
const contactedFromNotice = async (): Promise<void> => {
  if (noticeFor.value) await sourcing.contacted(noticeFor.value)
  noticeFor.value = null
}
const noticeContacted = computed(() => (sourcing.contacts.value ?? []).find((item) => item.id === noticeFor.value?.id)?.status === 'contacted')

const deleting = ref<SourcedContactDto | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  },
})
const confirmDelete = async (doNotContact: boolean): Promise<void> => {
  if (deleting.value && (await sourcing.remove(deleting.value, doNotContact))) deleting.value = null
}
</script>

<template>
  <div class="grid gap-6" data-testid="sourced-contacts-panel">
    <p class="flex items-start gap-2.5 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="sourcing-note">
      <InfoIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ t('sourcing.note') }}
    </p>
    <div class="flex justify-end">
      <Button variant="outline" data-testid="contact-add" @click="sourcing.clearError(), (adding = true)"><UserPlusIcon aria-hidden="true" />{{ t('sourcing.add.button') }}</Button>
    </div>
    <div v-if="sourcing.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="sourcing.errorKey.value" />
      <div><Button variant="outline" @click="() => sourcing.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!sourcing.contacts.value" class="grid gap-4" aria-busy="true"><Skeleton class="h-24 w-full" /></div>
    <section v-else-if="sourcing.contacts.value.length === 0" class="grid gap-5 rounded-xl panel px-6 py-10 sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:px-8" data-testid="sourcing-empty">
      <span class="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><UserSearchIcon class="size-5" /></span>
      <div class="grid max-w-xl gap-1.5">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('sourcing.emptyTitle') }}</h2>
        <p class="text-[0.9375rem] text-muted-foreground">{{ t('sourcing.emptyBody') }}</p>
      </div>
    </section>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel">
      <SourcedContactRow
        v-for="contact in sourcing.contacts.value"
        :key="contact.id"
        :contact="contact"
        :now="nowDate"
        :busy="sourcing.busy.value === contact.id"
        @notice="openNotice(contact)"
        @contacted="sourcing.contacted(contact)"
        @delete="deleting = contact"
      />
    </ul>
    <AddContactDialog v-model:open="adding" :busy="sourcing.busy.value === 'new'" :error-key="sourcing.saveErrorKey.value" @save="save" />
    <NoticeDialog v-model:open="noticeOpen" :name="nameOf(noticeFor)" :text="noticeText" :contacted="noticeContacted" @contacted="contactedFromNotice" />
    <DeleteContactDialog v-model:open="deleteOpen" :name="nameOf(deleting)" :pending="deleting !== null && sourcing.busy.value === deleting.id" @confirm="confirmDelete" />
  </div>
</template>
