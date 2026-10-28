<script setup lang="ts">
import type { TrackedLinkDto } from '@/lib/tracked-link-api'
import type { PipelineDto } from '@candydati/domain'

/**
 * Tracked links of one ad: the builder to add one, and the links already saved, read again every time the tab opens.
 * `pipeline` (null without `candidate:read`) gives who applied through each link. The saved links go up to the page too.
 */
const props = defineProps<{ jobId: string; jobUrl: string | null; pipeline: PipelineDto | null }>()
const emit = defineEmits<{ links: [links: readonly TrackedLinkDto[]] }>()
const links = useTrackedLinks(props.jobId)
watch(links.links, (value) => emit('links', value), { immediate: true })
</script>

<template>
  <TrackedLinkBuilder :job-url="jobUrl" :saving="links.busy.value === 'save'" @save="(link) => links.save(link)">
    <template #saved>
      <FormAlert v-if="links.errorKey.value" :message-key="links.errorKey.value" />
      <SavedTrackedLinks
        v-else
        :links="links.links.value"
        :job-url="jobUrl"
        :job-id="jobId"
        :pipeline="pipeline"
        :busy="links.busy.value"
        @remove="(linkId) => links.remove(linkId)"
      />
    </template>
  </TrackedLinkBuilder>
</template>
