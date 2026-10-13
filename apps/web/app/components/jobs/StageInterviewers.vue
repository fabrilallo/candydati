<script setup lang="ts">
import { UserPlusIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { addInterviewer, availableMembers, checkExternal, INTERVIEWERS_MAX, memberInterviewer, removeInterviewer, type MemberOption } from '@/lib/interviewers'
import type { InterviewerDto } from '@tt/domain'

/**
 * "Chi fa il colloquio" for one stage: members of the team (picker) and people outside it (name and email). They get
 * a personal link to leave feedback after each interview, without an account.
 */
const props = defineProps<{ id: string; interviewers: readonly InterviewerDto[]; members: readonly MemberOption[]; disabled?: boolean; busy?: boolean }>()
const emit = defineEmits<{ change: [list: readonly InterviewerDto[]] }>()
const { t } = useI18n()

const options = computed(() => availableMembers(props.members, props.interviewers))
const full = computed(() => props.interviewers.length >= INTERVIEWERS_MAX)
const adding = ref(false)
const name = ref('')
const email = ref('')
const errors = ref<Partial<Record<'name' | 'email', string>>>({})

const pick = (member: MemberOption): void => emit('change', addInterviewer(props.interviewers, memberInterviewer(member)))
const openExternal = async (): Promise<void> => {
  adding.value = true
  await nextTick()
  document.getElementById(`${props.id}-ext-name`)?.focus()
}
const cancel = (): void => {
  adding.value = false
  name.value = ''
  email.value = ''
  errors.value = {}
}
const addExternal = (): void => {
  const checked = checkExternal(name.value, email.value)
  if (!checked.ok) {
    errors.value = checked.errors
    return
  }
  emit('change', addInterviewer(props.interviewers, checked.interviewer))
  cancel()
}
</script>

<template>
  <div class="grid gap-2" :aria-labelledby="`${id}-label`" role="group" data-testid="stage-interviewers">
    <div class="flex flex-wrap items-center gap-1.5">
      <span :id="`${id}-label`" class="mr-1 text-xs text-muted-foreground">{{ t('job.interviewers.label') }}</span>
      <span v-for="(person, index) in interviewers" :key="`${person.userId ?? person.email}`" class="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-card pr-1 pl-1 text-xs font-medium shadow-xs" data-testid="interviewer-chip">
        <PersonAvatar :name="person.name || person.email || '?'" size="sm" class="size-5! text-[0.625rem]" />
        <span class="truncate">{{ person.name || person.email }}</span>
        <span v-if="person.kind === 'external'" class="text-muted-foreground">{{ t('job.interviewers.external') }}</span>
        <button
          v-if="!disabled"
          type="button"
          class="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          :aria-label="t('job.interviewers.remove', { name: person.name || person.email })"
          :disabled="busy"
          @click="emit('change', removeInterviewer(interviewers, index))"
        >
          <XIcon class="size-3" aria-hidden="true" />
        </button>
      </span>
      <span v-if="interviewers.length === 0" class="text-xs text-muted-foreground">{{ t('job.interviewers.nobody') }}</span>
      <DropdownMenu v-if="!disabled && !full">
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs" :disabled="busy" :data-testid="`${id}-add`">
            <UserPlusIcon aria-hidden="true" />{{ t('job.interviewers.add') }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-64">
          <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('job.interviewers.team') }}</DropdownMenuLabel>
          <DropdownMenuItem v-for="member in options" :key="member.userId" data-testid="interviewer-member" @select="pick(member)">
            <PersonAvatar :name="member.name" size="sm" class="size-6! text-[0.625rem]" />
            <span class="grid min-w-0"><span class="truncate">{{ member.name }}</span><span class="truncate text-xs text-muted-foreground">{{ member.email }}</span></span>
          </DropdownMenuItem>
          <p v-if="options.length === 0" class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('job.interviewers.noMembers') }}</p>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="interviewer-external" @select="openExternal">
            <UserPlusIcon aria-hidden="true" />{{ t('job.interviewers.addExternal') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div v-if="adding" class="grid gap-2 rounded-lg border bg-muted/50 p-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] @lg:items-start" data-testid="external-form" @keydown.enter.prevent="addExternal" @keydown.esc="cancel">
      <div class="grid gap-1">
        <Input :id="`${id}-ext-name`" v-model="name" :aria-label="t('job.interviewers.name')" :placeholder="t('job.interviewers.name')" autocomplete="off" :aria-invalid="Boolean(errors.name) || undefined" />
        <p v-if="errors.name" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.name) }}</p>
      </div>
      <div class="grid gap-1">
        <Input :id="`${id}-ext-email`" v-model="email" type="email" :aria-label="t('job.interviewers.email')" :placeholder="t('job.interviewers.email')" autocomplete="off" :aria-invalid="Boolean(errors.email) || undefined" />
        <p v-if="errors.email" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.email) }}</p>
      </div>
      <div class="flex gap-1.5">
        <Button type="button" size="sm" data-testid="external-add" @click="addExternal">{{ t('job.interviewers.confirm') }}</Button>
        <Button type="button" variant="ghost" size="sm" @click="cancel">{{ t('common.cancel') }}</Button>
      </div>
    </div>
  </div>
</template>
