<script setup lang="ts">
import type { ReportsView } from '@candydati/domain'

/** Tracked links of one ad: the builder to add one, and the links already saved, read again every time the tab opens. */
const props = defineProps<{ jobId: string; jobUrl: string | null; report: ReportsView | null }>()
const links = useTrackedLinks(props.jobId)
</script>

<template>
  <TrackedLinkBuilder :job-url="jobUrl" :saving="links.busy.value === 'save'" @save="(link) => links.save(link)">
    <template #saved>
      <FormAlert v-if="links.errorKey.value" :message-key="links.errorKey.value" />
      <SavedTrackedLinks
        v-else
        :links="links.links.value"
        :job-url="jobUrl"
        :report="report"
        :busy="links.busy.value"
        @remove="(linkId) => links.remove(linkId)"
      />
    </template>
  </TrackedLinkBuilder>
</template>
