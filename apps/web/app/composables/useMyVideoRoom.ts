import { toast } from 'vue-sonner'
import { ApiFailure } from '@/lib/api-call'
import { errorKeyOf } from '@/lib/auth-errors'
import { getMyVideoRoom, removeMyVideoRoom, saveMyVideoRoom, type VideoRoomViewDto } from '@/lib/interview-api'
import { loaded } from '@/lib/job-api'

const EMPTY: VideoRoomViewDto = { url: null, provider: null }

/** The signed-in person's own video room: the link of the video interviews they run. */
export const useMyVideoRoom = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('my-video-room', () => loaded(() => getMyVideoRoom(request)))
  const busy = ref<'save' | 'remove' | null>(null)
  const actionErrorKey = ref<string | null>(null)
  const latest = ref<VideoRoomViewDto | null>(null)

  const run = async (kind: 'save' | 'remove', action: () => Promise<VideoRoomViewDto>, successKey: string): Promise<boolean> => {
    busy.value = kind
    actionErrorKey.value = null
    try {
      latest.value = await action()
      toast.success(t(successKey))
      return true
    } catch (error) {
      // A link the api refuses (not https, credentials in it) says so; anything else keeps its own message.
      actionErrorKey.value = error instanceof ApiFailure && error.failure.status === 422 ? 'videoRoom.errors.url' : errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  return {
    room: computed(() => latest.value ?? data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    actionErrorKey: computed(() => actionErrorKey.value),
    busy: computed(() => busy.value),
    refresh,
    save: (url: string) => run('save', () => saveMyVideoRoom(request, url), 'videoRoom.saved'),
    remove: () =>
      run('remove', async () => {
        await removeMyVideoRoom(request)
        return EMPTY
      }, 'videoRoom.removed'),
  }
}
