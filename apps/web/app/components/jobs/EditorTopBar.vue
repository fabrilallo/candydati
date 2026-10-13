<script setup lang="ts">
import { BookmarkPlusIcon, EllipsisIcon, SendIcon, XCircleIcon } from '@lucide/vue'
import type { JobStatus } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Gap } from '@/lib/ad-gaps'
import type { SaveState } from '@/lib/editor-inputs'

/**
 * The editor's actions, shown in the sticky top bar so they stay at hand while scrolling: save state, readiness and
 * the actions the role allows. Publish is the one primary action; the rare ones (template, close) live in the overflow menu.
 */
const props = defineProps<{
  status: JobStatus
  saveState: SaveState
  gaps: readonly Gap[]
  readOnly: boolean
  canPublish: boolean
  canClose: boolean
  canTemplate: boolean
  publishable: boolean
  busy: string | null
  analysing: boolean
}>()
const emit = defineEmits<{ publish: []; close: []; template: []; jump: [fieldId: string]; reveal: [] }>()
const { t } = useI18n()

const showPublish = computed(() => props.canPublish && props.status === 'draft')
const hasMenu = computed(() => props.canTemplate || props.canClose)
const saveLabel = computed(() => (props.busy === 'save' ? t('job.actions.saving') : props.status === 'draft' ? t('job.actions.saveDraft') : t('job.actions.save')))
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-end sm:gap-3" data-testid="editor-bar">
    <div class="flex min-w-0 items-center gap-2 sm:gap-3">
      <SaveStatus v-if="!readOnly" :state="saveState" :class="saveState === 'saved' ? 'max-sm:hidden' : ''" />
      <ReadinessMenu v-if="showPublish" :gaps="gaps" @jump="emit('jump', $event)" @reveal="emit('reveal')" />
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <Button v-if="!readOnly" type="submit" form="job-form" variant="outline" size="sm" :disabled="busy !== null" data-testid="save">
        <span :class="status === 'draft' && busy !== 'save' ? 'max-sm:hidden' : ''">{{ saveLabel }}</span>
        <span v-if="status === 'draft' && busy !== 'save'" class="sm:hidden">{{ t('job.actions.save') }}</span>
      </Button>
      <Button
        v-if="showPublish"
        type="button"
        size="sm"
        :disabled="!publishable || busy !== null || analysing"
        :aria-describedby="publishable ? undefined : 'publish-hint'"
        data-testid="publish"
        @click="emit('publish')"
      >
        <SendIcon class="max-sm:hidden" aria-hidden="true" />
        {{ busy === 'publish' ? t('job.publish.publishing') : t('job.publish.action') }}
      </Button>
      <DropdownMenu v-if="hasMenu">
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="ghost" size="icon-sm" :disabled="busy !== null" :aria-label="t('job.editor.workspace.more')" data-testid="more-actions">
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-56">
          <DropdownMenuItem v-if="canTemplate" data-testid="save-template" @select="emit('template')">
            <BookmarkPlusIcon aria-hidden="true" />
            {{ t('job.actions.saveAsTemplate') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="canTemplate && canClose" />
          <DropdownMenuItem v-if="canClose" variant="destructive" data-testid="close-job" @select="emit('close')">
            <XCircleIcon aria-hidden="true" />
            {{ t('job.actions.close') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <p v-if="showPublish && !publishable" id="publish-hint" class="sr-only">{{ t('job.publish.disabledHint') }}</p>
  </div>
</template>
