<script setup lang="ts">
import { ArrowRightIcon, ChevronDownIcon } from '@lucide/vue'
import type { LocalizedRecipe } from '@candydati/domain'

/** One recipe: the title opens the numbered steps and the link to the page where it starts. */
const props = defineProps<{ recipe: LocalizedRecipe; open?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <details class="group rounded-lg border bg-card" :open="props.open" :data-testid="`help-recipe-${props.recipe.id}`">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
      <span>{{ props.recipe.title }}</span>
      <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div class="grid gap-4 px-4 pt-1 pb-4">
      <ol class="grid list-decimal gap-1.5 pl-5 text-[0.9375rem] marker:font-semibold marker:text-muted-foreground">
        <li v-for="(step, index) in props.recipe.steps" :key="index">{{ step }}</li>
      </ol>
      <div>
        <Button as-child size="sm">
          <NuxtLink :to="props.recipe.href" :data-testid="`help-go-${props.recipe.id}`">
            {{ t('help.goThere') }}
            <ArrowRightIcon class="size-4" aria-hidden="true" />
          </NuxtLink>
        </Button>
      </div>
    </div>
  </details>
</template>
