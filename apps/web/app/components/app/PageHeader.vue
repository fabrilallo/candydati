<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Page header: optional ink icon tile, title (h1) with a status pill (`badge` slot), a meta line or a description,
 * actions on the right (wrapping below on a phone) and optional underline tabs that close the header.
 */
defineProps<{ title: string; description?: string | undefined; icon?: Component | undefined }>()
</script>

<template>
  <header class="grid gap-5">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div class="flex min-w-0 items-start gap-4">
        <span v-if="icon" class="grid size-11 shrink-0 place-items-center rounded-lg bg-foreground text-background sm:size-12" aria-hidden="true" data-testid="page-icon">
          <component :is="icon" class="size-5 sm:size-[1.375rem]" />
        </span>
        <div class="grid min-w-0 gap-1.5">
          <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 class="min-w-0 text-[1.875rem] leading-none font-extrabold tracking-display break-words sm:text-[2.75rem]">{{ title }}</h1>
            <slot name="badge" />
          </div>
          <p v-if="description" class="max-w-2xl text-[0.9375rem] text-muted-foreground">{{ description }}</p>
          <slot name="description" />
          <div v-if="$slots.meta" class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground [&>*+*]:before:mr-2.5 [&>*+*]:before:text-input [&>*+*]:before:content-['|']">
            <slot name="meta" />
          </div>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot name="tabs" />
  </header>
</template>
