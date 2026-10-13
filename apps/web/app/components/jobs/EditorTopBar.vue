<script setup lang="ts">
import { ArrowLeftIcon, BookmarkPlusIcon, EllipsisIcon, SendIcon, XCircleIcon } from '@lucide/vue'
import type { JobStatus } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Gap } from '@/lib/ad-gaps'
import type { SaveState } from '@/lib/editor-inputs'

/**
 * Slim sticky bar of the editor: back, title, status, save state, readiness and the actions the role allows.
 * Publish is the one primary action; the rare ones (template, close) live in the overflow menu.
 */
const props = defineProps<{
  heading: string
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
  <div class="sticky top-14 z-20 -mx-4 border-b bg-background/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10" data-testid="editor-bar">
    <!-- Two rows on a phone (title and menu, then state and actions), one row from sm. -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="order-1 flex min-w-0 flex-1 basis-56 items-center gap-2">
        <Button as-child variant="ghost" size="icon-sm" class="-ml-1.5 shrink-0 text-muted-foreground">
          <NuxtLink to="/app/jobs" :aria-label="t('job.editor.back')">
            <ArrowLeftIcon aria-hidden="true" />
          </NuxtLink>
        </Button>
        <h1 class="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">{{ heading }}</h1>
        <JobStatusBadge :status="status" class="shrink-0" />
      </div>
      <div class="order-3 flex w-full items-center justify-between gap-2 sm:order-2 sm:gap-3 sm:ml-auto sm:w-auto sm:justify-end">
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <SaveStatus v-if="!readOnly" :state="saveState" />
          <ReadinessMenu v-if="showPublish" :gaps="gaps" @jump="emit('jump', $event)" @reveal="emit('reveal')" />
        </div>
        <div class="flex shrink-0 items-center gap-2">
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
        </div>
      </div>
      <DropdownMenu v-if="hasMenu">
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="ghost" size="icon-sm" class="order-2 shrink-0 sm:order-3 sm:-ml-2" :disabled="busy !== null" :aria-label="t('job.editor.workspace.more')" data-testid="more-actions">
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
