<script setup lang="ts">
import type { MigrationIssueDto, MigrationIssueLevel } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The findings of one level, read a page at a time. They are grouped by code and each group says, in plain language,
 * what it means; the references are the package's own (never personal data). When not everything is loaded yet the
 * counts say so ("showing 50 of 312").
 */
const props = defineProps<{ migrationId: string; level: MigrationIssueLevel; total: number }>()
const { t } = useI18n()
const issues = useMigrationIssues(props.migrationId, props.level)
const REFS_SHOWN = 8
const TONES = { error: 'destructive', warning: 'warning', info: 'secondary' } as const

interface Group {
  readonly code: MigrationIssueDto['code']
  readonly refs: readonly string[]
  readonly count: number
}
const groups = computed((): readonly Group[] => {
  const byCode = new Map<string, MigrationIssueDto[]>()
  for (const issue of issues.items.value) byCode.set(issue.code, [...(byCode.get(issue.code) ?? []), issue])
  return [...byCode].map(([code, items]) => ({ code: code as Group['code'], count: items.length, refs: items.flatMap((item) => (item.ref === null ? [] : [item.ref])) }))
})
const refsText = (group: Group): string => `${group.refs.slice(0, REFS_SHOWN).join(', ')}${group.refs.length > REFS_SHOWN ? ' …' : ''}`
const headingId = computed(() => `migration-issues-${props.level}`)
</script>

<template>
  <section class="grid gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs sm:px-6" :aria-labelledby="headingId" :data-testid="`migration-issues-${level}`">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="grid gap-0.5">
        <h4 :id="headingId" class="flex items-center gap-2 text-[0.9375rem] font-semibold">
          {{ t(`migrations.preview.issues.level.${level}`) }}
          <Badge :variant="TONES[level]" class="figure">{{ t('migrations.preview.issues.items', { count: total }, total) }}</Badge>
        </h4>
        <p class="text-sm text-muted-foreground">{{ t(`migrations.preview.issues.levelHint.${level}`) }}</p>
      </div>
      <Button v-if="!issues.started.value" type="button" variant="outline" size="sm" :data-testid="`migration-issues-show-${level}`" @click="issues.more">{{ t('migrations.preview.issues.show') }}</Button>
    </div>

    <FormAlert :message-key="issues.errorKey.value ? 'migrations.preview.issues.failed' : null" />
    <div v-if="issues.errorKey.value" class="flex"><Button type="button" variant="outline" size="sm" @click="issues.more">{{ t('migrations.preview.issues.retry') }}</Button></div>

    <ul v-if="groups.length > 0" class="grid divide-y" :aria-busy="issues.loading.value">
      <li v-for="group in groups" :key="group.code" class="grid gap-0.5 py-2.5 first:pt-0" :data-code="group.code">
        <p class="text-sm text-pretty">{{ t(`migrations.issue.${group.code}`, { count: group.count }, group.count) }}</p>
        <p v-if="group.refs.length > 0" class="font-mono text-xs break-all text-muted-foreground">{{ t('migrations.preview.issues.refs', { refs: refsText(group) }) }}</p>
      </li>
    </ul>
    <p v-if="issues.loading.value" class="text-sm text-muted-foreground" role="status">{{ t('migrations.preview.issues.loading') }}</p>
    <div v-if="issues.started.value && issues.items.value.length > 0" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p class="figure text-muted-foreground">{{ issues.items.value.length }} / {{ issues.total.value }}</p>
      <Button v-if="issues.hasMore.value && !issues.loading.value" type="button" variant="outline" size="sm" :data-testid="`migration-issues-more-${level}`" @click="issues.more">{{ t('migrations.preview.issues.more') }}</Button>
    </div>
  </section>
</template>
