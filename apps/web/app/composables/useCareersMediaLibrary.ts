import type { CareersMediaAssetDto } from '@tt/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { deleteCareersMedia, listCareersMedia, uploadCareersMedia, type MediaUploadInput, type UploadXhr } from '@/lib/careers-page-api'
import type { JobApiRequest } from '@/lib/job-api'
import { loaded } from '@/lib/job-api'

/** The browser's request object, created only when an upload starts (tests replace the global). */
const browserXhr = (): UploadXhr => new XMLHttpRequest() as unknown as UploadXhr

export interface MediaUpload {
  readonly done: Promise<CareersMediaAssetDto>
  readonly cancel: () => void
}

/** The organization's careers media: list, upload with progress, delete. The list stays in sync with what changed here. */
export const useCareersMediaLibrary = (request: JobApiRequest) => {
  const { data, refresh } = useAsyncData('careers-media', () => loaded(() => listCareersMedia(request)))
  const assets = ref<readonly CareersMediaAssetDto[]>(data.value?.data ?? [])
  watch(data, (fresh) => {
    if (fresh?.data) assets.value = fresh.data
  })

  const upload = (input: MediaUploadInput, onProgress: (percent: number) => void): MediaUpload => {
    const started = uploadCareersMedia(input, onProgress, browserXhr)
    const done = started.done.then((asset) => {
      assets.value = [asset, ...assets.value.filter((current) => current.id !== asset.id)]
      return asset
    })
    return { done, cancel: started.cancel }
  }

  /** Deletes an unused asset; resolves the translation key of the refusal, or null when it is gone. */
  const remove = async (id: string): Promise<string | null> => {
    try {
      await deleteCareersMedia(request, id)
      assets.value = assets.value.filter((asset) => asset.id !== id)
      return null
    } catch (error) {
      return errorKeyOf(error)
    }
  }

  return {
    assets: computed(() => assets.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    refresh,
    upload,
    remove,
  }
}

export type CareersMediaLibrary = ReturnType<typeof useCareersMediaLibrary>
