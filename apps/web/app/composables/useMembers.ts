import { attempt } from '@/lib/load-result'

/** The members of the active organization (assignees of tasks and automatic tasks), shared with the members page. */
export const useMembers = () => {
  const api = useAuthApi()
  const { data, refresh } = useFreshAsyncData('organization-members', () => attempt(() => api.getFullOrganization()))
  const members = computed(() => data.value?.data?.members ?? [])
  return {
    members,
    errorKey: computed(() => data.value?.errorKey ?? null),
    nameOf: (userId: string): string | null => members.value.find((member) => member.userId === userId)?.name ?? null,
    refresh,
  }
}
