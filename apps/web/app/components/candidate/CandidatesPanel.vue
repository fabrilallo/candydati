<script setup lang="ts">
import { DatabaseIcon, SearchIcon, TagIcon, UsersRoundIcon, XIcon } from '@lucide/vue'
import { pageCount } from '@/lib/audit-api'
import type { TabItem } from '@/lib/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

/** Search the people who applied: everyone, or only those who agreed to be kept for future positions. */
const { t } = useI18n()
const list = useCandidateList()
const pages = computed(() => (list.meta.value ? pageCount(list.meta.value) : 1))
const nowMs = useState('candidates-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
type Scope = 'all' | 'pool'
const scope = computed<Scope>({
  get: () => (list.talentPool.value ? 'pool' : 'all'),
  set: (value) => {
    list.talentPool.value = value === 'pool'
  },
})
const scopes = computed<readonly TabItem<Scope>[]>(() => [
  { value: 'all', label: t('candidates.scopes.all'), icon: UsersRoundIcon, testId: 'scope-all' },
  { value: 'pool', label: t('candidates.scopes.pool'), icon: DatabaseIcon, testId: 'scope-pool' },
])
const tagDraft = ref('')
const applyTag = (): void => {
  if (tagDraft.value.trim() !== '') list.setTag(tagDraft.value)
  tagDraft.value = ''
}
const toggleTag = (tag: string): void => list.setTag(list.tag.value === tag ? null : tag)
const filtered = computed(() => list.query.value.trim() !== '' || list.talentPool.value || list.tag.value !== null)
</script>

<template>
  <div class="grid gap-4">
    <UnderlineTabs v-model="scope" :items="scopes" :label="t('candidates.scopes.label')" />
    <p v-if="list.talentPool.value" class="text-sm text-muted-foreground">{{ t('candidates.poolHint') }}</p>
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative min-w-0 flex-1 sm:max-w-sm">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="list.query.value" type="search" class="pl-9" :placeholder="t('candidates.search')" :aria-label="t('candidates.search')" data-testid="candidates-search" />
      </div>
      <form class="relative w-full sm:w-48" @submit.prevent="applyTag">
        <TagIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="tagDraft" class="pl-9" :placeholder="t('candidates.tagFilter')" :aria-label="t('candidates.tagFilter')" data-testid="candidates-tag" @blur="applyTag" />
      </form>
      <button
        v-if="list.tag.value"
        type="button"
        class="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent pr-2 pl-3 text-xs font-medium text-accent-foreground"
        :aria-label="t('candidates.clearTag', { tag: list.tag.value })"
        data-testid="active-tag"
        @click="list.setTag(null)"
      >
        {{ list.tag.value }}<XIcon class="size-3.5" aria-hidden="true" />
      </button>
    </div>

    <div v-if="list.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="list.errorKey.value" />
      <div><Button variant="outline" @click="() => list.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <template v-else>
      <ul v-if="list.loading.value && list.candidates.value.length === 0" class="divide-y overflow-hidden rounded-xl panel" aria-busy="true" data-testid="candidates-loading">
        <li v-for="n in 5" :key="n" class="flex items-center gap-3 px-5 py-4 sm:px-6">
          <Skeleton class="size-9 rounded-full" />
          <div class="grid flex-1 gap-2"><Skeleton class="h-4 w-2/5" /><Skeleton class="h-3 w-1/4" /></div>
          <Skeleton class="hidden h-4 w-24 md:block" />
        </li>
      </ul>
      <div v-else :class="list.loading.value || list.searching.value ? 'opacity-60 transition-opacity' : ''" :aria-busy="list.loading.value">
        <div v-if="list.candidates.value.length === 0" class="grid justify-items-start gap-1 rounded-xl border border-dashed border-input px-6 py-8" data-testid="candidates-empty">
          <p class="text-[0.9375rem] font-medium">{{ filtered ? t('candidates.emptyFiltered') : t('candidates.empty') }}</p>
          <p class="text-sm text-muted-foreground">{{ filtered ? t('candidates.emptyFilteredBody') : t('candidates.emptyBody') }}</p>
          <p v-if="filtered" class="text-sm text-muted-foreground" data-testid="candidates-imported-note">{{ t('candidates.importedNote') }}</p>
        </div>
        <ul v-else class="divide-y overflow-hidden rounded-xl panel">
          <CandidateRow v-for="candidate in list.candidates.value" :key="candidate.id" :candidate="candidate" :now="now" :active-tag="list.tag.value" @tag="toggleTag" />
        </ul>
      </div>
      <PaginationBar v-if="list.meta.value && list.meta.value.total > 0" :page="list.page.value" :pages="pages" :total="list.meta.value.total" :disabled="list.loading.value" status-key="candidates.pagination" @update:page="list.goTo" />
    </template>
  </div>
</template>
