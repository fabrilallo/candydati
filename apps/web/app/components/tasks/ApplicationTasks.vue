<script setup lang="ts">
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** The "Attività" tab of the candidate detail: the tasks of this application and, with `task:manage`, a form to add one. */
const props = defineProps<{ applicationId: string; jobId: string }>()
const { t } = useI18n()
const { viewer } = useViewer()
const canManage = computed(() => can(viewer.value?.role ?? null, 'task:manage'))
const tasks = useTasks(props.applicationId)
const team = useMembers()
const nowMs = useState('tasks-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const add = async (value: { title: string; assigneeId: string; dueAt: string | null }, done: (ok: boolean) => void): Promise<void> => {
  done(await tasks.create({ ...value, jobId: props.jobId }))
}
</script>

<template>
  <div class="grid gap-5" data-testid="application-tasks">
    <template v-if="canManage">
      <FormAlert v-if="team.errorKey.value" message-key="tasks.membersFailed" />
      <TaskForm :members="team.members.value" :default-assignee="viewer?.user.id ?? ''" :busy="tasks.busy.value === 'create'" id-prefix="application-task" @submit="add" />
    </template>
    <div v-if="tasks.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="tasks.errorKey.value" />
      <div><Button variant="outline" @click="() => tasks.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!tasks.tasks.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-12 w-full" /><Skeleton class="h-12 w-full" /></div>
    <p v-else-if="tasks.tasks.value.length === 0" class="rounded-xl border border-dashed border-input px-5 py-4 text-sm text-muted-foreground" data-testid="tasks-empty">{{ t('tasks.emptyApplication') }}</p>
    <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      <TaskItem
        v-for="task in tasks.tasks.value"
        :key="task.id"
        :task="task"
        :now="now"
        :assignee-name="task.assigneeName ?? team.nameOf(task.assigneeId)"
        :can-toggle="canManage || task.assigneeId === viewer?.user.id"
        :busy="tasks.busy.value === task.id"
        @toggle="tasks.toggle(task)"
      />
    </ul>
  </div>
</template>
