import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { createTask, listApplicationTasks, listMyTasks, setTaskDone, type TaskInput } from '@/lib/inbox-api'
import { replaceTask } from '@/lib/inbox-view'
import { loaded } from '@/lib/job-api'
import type { TaskDto } from '@candydati/domain'

/**
 * Tasks of one application, or the open tasks of the signed-in person (`applicationId` null). Completing keeps the
 * task on screen, struck through, so it can be reopened at once; a reload drops it from "Le mie attività".
 */
export const useTasks = (applicationId: string | null) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const key = applicationId ? `tasks-application-${applicationId}` : 'tasks-mine'
  const { data, status, refresh } = useFreshAsyncData(key, () => loaded(() => (applicationId ? listApplicationTasks(request, applicationId) : listMyTasks(request))))
  const tasks = ref<readonly TaskDto[] | null>(data.value?.data ?? null)
  watch(data, (fresh) => {
    tasks.value = fresh?.data ?? null
  })
  const busy = ref<string | null>(null)

  const create = async (input: Omit<TaskInput, 'applicationId'>): Promise<boolean> => {
    busy.value = 'create'
    try {
      const created = await createTask(request, { ...input, applicationId })
      tasks.value = [...(tasks.value ?? []), created]
      toast.success(t('tasks.created'))
      return true
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return false
    } finally {
      busy.value = null
    }
  }

  const toggle = async (task: TaskDto): Promise<void> => {
    const done = task.completedAt === null
    busy.value = task.id
    try {
      const fresh = await setTaskDone(request, task.id, done)
      tasks.value = replaceTask(tasks.value ?? [], fresh)
      toast.success(t(done ? 'tasks.completed' : 'tasks.reopened'))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      busy.value = null
    }
  }

  return {
    tasks: computed(() => tasks.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    busy: computed(() => busy.value),
    refresh,
    create,
    toggle,
  }
}
