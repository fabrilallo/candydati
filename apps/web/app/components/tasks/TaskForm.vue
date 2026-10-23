<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { TASK_TITLE_MAX } from '@candydati/domain'
import { validateTaskForm, type TaskFormErrors } from '@/lib/inbox-view'
import type { MemberRow } from '@/lib/auth-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** Title, assignee (a member) and an optional due date. The parent sends it; the form resets when it went through. */
const props = defineProps<{ members: readonly MemberRow[]; defaultAssignee: string; busy: boolean; idPrefix: string }>()
const emit = defineEmits<{ submit: [value: { title: string; assigneeId: string; dueAt: string | null }, done: (ok: boolean) => void] }>()
const { t } = useI18n()
const title = ref('')
const assigneeId = ref(props.defaultAssignee)
const dueDate = ref('')
const errors = ref<TaskFormErrors>({})
const field = (name: string): string => `${props.idPrefix}-${name}`

const submit = (): void => {
  const result = validateTaskForm({ title: title.value, assigneeId: assigneeId.value, dueDate: dueDate.value })
  errors.value = result.errors
  if (!result.value) return
  emit('submit', result.value, (ok) => {
    if (!ok) return
    title.value = ''
    dueDate.value = ''
  })
}
</script>

<template>
  <form class="grid gap-4 rounded-xl panel px-5 py-5 sm:px-6" novalidate data-testid="task-form" @submit.prevent="submit">
    <FormField :id="field('title')" :label="t('tasks.fields.title')" :error="errors.title">
      <template #default="{ invalid, describedBy }">
        <Input :id="field('title')" v-model="title" :maxlength="TASK_TITLE_MAX" :placeholder="t('tasks.fields.titlePlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="task-title" />
      </template>
    </FormField>
    <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <FormField :id="field('assignee')" :label="t('tasks.fields.assignee')" :error="errors.assigneeId">
        <template #default="{ invalid, describedBy }">
          <NativeSelect :id="field('assignee')" v-model="assigneeId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="task-assignee">
            <option value="" disabled>{{ t('tasks.fields.assigneePlaceholder') }}</option>
            <option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.name }}</option>
          </NativeSelect>
        </template>
      </FormField>
      <FormField :id="field('due')" :label="t('tasks.fields.due')" :hint="t('tasks.fields.dueHint')" :error="errors.dueDate">
        <template #default="{ invalid, describedBy }">
          <Input :id="field('due')" v-model="dueDate" type="date" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="task-due-input" />
        </template>
      </FormField>
    </div>
    <div class="flex justify-end">
      <Button type="submit" variant="outline" :disabled="busy" data-testid="task-submit"><PlusIcon aria-hidden="true" />{{ busy ? t('tasks.adding') : t('tasks.add') }}</Button>
    </div>
  </form>
</template>
