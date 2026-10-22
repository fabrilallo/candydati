<script setup lang="ts">
/**
 * The big yellow sticker of the ad hero (docs/DESIGN-SYSTEM.md §3.1): the promise that every applicant hears back
 * after every stage, in the language of the ad. It states the principle, not the number of days: the response time is
 * a commitment restated after applying, not shown on the public ad (PRODUCT.md §4.1).
 */
const ad = useAdContext()
</script>

<template>
  <span
    role="img"
    :aria-label="ad.x('public.promise.label')"
    class="flex size-28 shrink-0 rotate-[8deg] flex-col items-center justify-center rounded-full border-2 border-ink bg-highlight text-center leading-none text-highlight-foreground select-none @2xl:size-[9.5rem]"
    data-testid="promise-sticker"
  >
    <span class="text-[0.6875rem] font-bold @2xl:text-[0.8125rem]" aria-hidden="true">{{ ad.x('public.promise.top') }}</span>
    <span class="my-1 text-2xl font-extrabold tracking-display @2xl:text-[2.125rem]" aria-hidden="true">{{ ad.x('public.promise.figure') }}</span>
    <span class="text-[0.6875rem] font-bold @2xl:text-[0.8125rem]" aria-hidden="true">{{ ad.x('public.promise.bottom') }}</span>
  </span>
</template>
