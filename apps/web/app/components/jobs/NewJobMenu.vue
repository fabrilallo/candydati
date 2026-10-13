<script setup lang="ts">
import { ChevronDownIcon, FileTextIcon, PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const { t } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button data-testid="new-job">
        <PlusIcon aria-hidden="true" />
        {{ t('job.list.new') }}
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem as-child>
        <NuxtLink to="/app/jobs/new"><PlusIcon aria-hidden="true" />{{ t('job.list.newBlank') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <NuxtLink to="/app/jobs/templates"><FileTextIcon aria-hidden="true" />{{ t('job.list.newFromTemplate') }}</NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
