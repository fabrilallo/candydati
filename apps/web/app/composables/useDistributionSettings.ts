import type { DistributionChannelDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getDistribution, setChannelEnabled } from '@/lib/distribution-api'
import { loaded } from '@/lib/job-api'

/** Built-in channels (the feed) have nothing to switch. */
const registered = (list: readonly DistributionChannelDto[] | undefined): readonly DistributionChannelDto[] | null => (list ? list.filter((channel) => !channel.builtIn) : null)

/** The channels registered by the instance, with the organization's on/off switch for each. */
export const useDistributionSettings = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useAsyncData('distribution-settings', () => loaded(() => getDistribution(request)))
  const channels = ref<readonly DistributionChannelDto[] | null>(registered(data.value?.data?.channels))
  watch(data, (fresh) => {
    channels.value = registered(fresh?.data?.channels)
  })
  const busy = ref<string | null>(null)

  const setEnabled = async (channel: DistributionChannelDto, enabled: boolean): Promise<void> => {
    busy.value = channel.channelId
    try {
      const fresh = await setChannelEnabled(request, channel.channelId, enabled)
      channels.value = (channels.value ?? []).map((item) => (item.channelId === channel.channelId ? { ...item, enabled: fresh.enabled } : item))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      busy.value = null
    }
  }

  return { channels: computed(() => channels.value), errorKey: computed(() => data.value?.errorKey ?? null), busy: computed(() => busy.value), refresh, setEnabled }
}
