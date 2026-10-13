<script setup lang="ts">
import type { StageRef, AttentionItemDto  } from '@tt/domain'
import { MailIcon, PanelRightOpenIcon } from '@lucide/vue'
import { fullName } from '@/lib/candidate-view'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'

/** One application waiting for an answer: who, which job and stage, when it is due, who owns it, and what to do. */
const props = defineProps<{ item: AttentionItemDto; now: Date; canSend: boolean; canMove: boolean; busy?: boolean }>()
const emit = defineEmits<{ open: []; message: []; move: [stage: StageRef] }>()
const { t, locale } = useI18n()
const name = computed(() => fullName(props.item.candidate))
const stage = computed(() => props.item.stage.label ?? t('pipeline.received'))
const pill = computed(() => ({ responseDueAt: props.item.responseDueAt, respondedAt: null, responseState: props.item.state, outcome: null }))
const href = computed(() => `/app/candidates/${encodeURIComponent(props.item.candidate.id)}?application=${encodeURIComponent(props.item.applicationId)}`)
</script>

<template>
  <li class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-5 py-4 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,13rem)_auto] md:gap-x-5" :class="busy ? 'opacity-60' : ''" data-testid="attention-row" :data-application-id="item.applicationId">
    <PersonAvatar :name="name" />
    <div class="grid min-w-0 gap-0.5">
      <h3 class="truncate text-[0.9375rem] font-medium leading-snug">
        <NuxtLink :to="href" class="outline-none hover:underline focus-visible:underline underline-offset-4" data-testid="attention-name">{{ name }}</NuxtLink>
      </h3>
      <p class="truncate text-sm text-muted-foreground">
        <NuxtLink :to="`/app/jobs/${encodeURIComponent(item.job.id)}/candidates`" class="hover:text-foreground">{{ item.job.title }}</NuxtLink>
        <span aria-hidden="true"> · </span>{{ t('attention.stage', { stage }) }}
      </p>
    </div>
    <div class="col-start-2 grid justify-items-start gap-1 md:col-start-auto">
      <ResponsePill :application="pill" :now="now" />
      <p class="text-xs text-muted-foreground">
        <span class="figure">{{ formatDate(item.responseDueAt, locale) }}</span>
        <template v-if="item.ownerName"><span aria-hidden="true"> · </span>{{ t('attention.owner', { name: item.ownerName }) }}</template>
      </p>
    </div>
    <div class="col-start-2 -ml-2.5 flex flex-wrap items-center gap-1 md:col-start-auto md:ml-0 md:justify-end" role="group" :aria-label="t('attention.actions.label', { name })">
      <Button variant="ghost" size="sm" :aria-label="`${t('attention.actions.open')}: ${name}`" data-testid="attention-open" @click="emit('open')">
        <PanelRightOpenIcon aria-hidden="true" /><span class="max-md:sr-only">{{ t('attention.actions.open') }}</span>
      </Button>
      <Button v-if="canSend" variant="ghost" size="sm" :disabled="busy" :aria-label="`${t('attention.actions.message')}: ${name}`" data-testid="attention-message" @click="emit('message')">
        <MailIcon aria-hidden="true" /><span class="max-md:sr-only">{{ t('attention.actions.message') }}</span>
      </Button>
      <AttentionMoveMenu v-if="canMove" :job-id="item.job.id" :stage-id="item.stage.id" :name="name" :busy="busy" @move="emit('move', $event)" />
    </div>
  </li>
</template>
