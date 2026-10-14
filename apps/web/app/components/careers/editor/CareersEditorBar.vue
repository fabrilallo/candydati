<script setup lang="ts">
import { CheckIcon, CircleAlertIcon, ExternalLinkIcon, LoaderCircleIcon, SendIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { CareersBusy } from '@/composables/useCareersPageSave'

/** Actions of the careers page editor in the sticky top bar: save state, save the draft, publish, open the public page. */
const props = defineProps<{ busy: CareersBusy; dirty: boolean; issueCount: number; publishable: boolean; publicPath: string }>()
const emit = defineEmits<{ save: []; publish: [] }>()
const { t } = useI18n()

type State = 'saving' | 'invalid' | 'unsaved' | 'saved'
const state = computed<State>(() => (props.busy === 'save' ? 'saving' : props.issueCount > 0 ? 'invalid' : props.dirty ? 'unsaved' : 'saved'))
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:justify-end sm:gap-3" data-testid="careers-editor-bar">
    <p role="status" aria-live="polite" class="flex min-h-5 items-center gap-1.5 text-xs whitespace-nowrap" :class="state === 'invalid' ? 'text-destructive' : 'text-muted-foreground'" :data-state="state" data-testid="careers-save-state">
      <LoaderCircleIcon v-if="state === 'saving'" class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <CircleAlertIcon v-else-if="state === 'invalid'" class="size-3.5" aria-hidden="true" />
      <span v-else-if="state === 'unsaved'" class="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      <CheckIcon v-else class="size-3.5" aria-hidden="true" />
      {{ state === 'invalid' ? t('careersEditor.state.invalid', { count: issueCount }, issueCount) : t(`careersEditor.state.${state}`) }}
    </p>
    <div class="flex shrink-0 items-center gap-1.5">
      <Button as-child variant="ghost" size="sm">
        <a :href="publicPath" target="_blank" rel="noopener" data-testid="careers-view-public">
          <ExternalLinkIcon aria-hidden="true" /><span class="max-sm:sr-only">{{ t('careersEditor.actions.viewPublic') }}</span>
          <span class="sr-only">{{ t('careersSite.newTab') }}</span>
        </a>
      </Button>
      <Button type="button" variant="outline" size="sm" :disabled="busy !== null" data-testid="careers-save" @click="emit('save')">
        {{ busy === 'save' ? t('careersEditor.state.saving') : t('careersEditor.actions.save') }}
      </Button>
      <Button type="button" size="sm" :disabled="!publishable || busy !== null" :aria-describedby="issueCount > 0 ? 'cp-publish-hint' : undefined" data-testid="careers-publish" @click="emit('publish')">
        <SendIcon class="max-sm:hidden" aria-hidden="true" />
        {{ busy === 'publish' ? t('careersEditor.publish.publishing') : t('careersEditor.actions.publish') }}
      </Button>
    </div>
    <p v-if="issueCount > 0" id="cp-publish-hint" class="sr-only">{{ t('careersEditor.publish.blocked') }}</p>
  </div>
</template>
