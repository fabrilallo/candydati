<script setup lang="ts">
import { PowerOffIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/** No model configured: a calm word for everyone, and for whoever runs the instance, what to set. */
const { t } = useI18n()
const { viewer } = useViewer()
const admin = computed(() => can(viewer.value?.role ?? null, 'organization:update'))
</script>

<template>
  <div class="grid gap-3 rounded-xl border border-dashed border-input px-5 py-5" data-testid="assistant-off">
    <p class="flex items-center gap-2 text-sm font-medium"><PowerOffIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('assistant.off.title') }}</p>
    <p class="text-sm text-muted-foreground text-pretty">{{ t('assistant.off.body') }}</p>
    <template v-if="admin">
      <p class="text-sm text-muted-foreground text-pretty">{{ t('assistant.off.admin') }}</p>
      <pre tabindex="0" class="overflow-x-auto rounded-lg border bg-muted px-3 py-2 font-mono text-xs"><code>AGENT_MODEL=provider/model</code></pre>
    </template>
    <p v-else class="text-sm text-muted-foreground">{{ t('assistant.off.member') }}</p>
  </div>
</template>
