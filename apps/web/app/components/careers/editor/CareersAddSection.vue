<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import type { SectionType } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SECTION_ICONS } from '@/lib/careers-section-icons'

/** "Add section": every type the page can still take, each with what it is for in one line. */
defineProps<{ types: readonly SectionType[]; disabled: boolean }>()
const emit = defineEmits<{ add: [type: SectionType] }>()
const { t } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="outline" size="sm" :disabled="disabled" data-testid="careers-add-section">
        <PlusIcon aria-hidden="true" />{{ t('careersEditor.sections.add') }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-80">
      <DropdownMenuItem v-for="type in types" :key="type" class="items-start gap-3 py-2" :data-testid="`careers-add-${type}`" @select="emit('add', type)">
        <component :is="SECTION_ICONS[type]" class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="grid gap-0.5">
          <span class="text-sm font-medium">{{ t(`careersEditor.types.${type}.name`) }}</span>
          <span class="text-xs text-muted-foreground">{{ t(`careersEditor.types.${type}.description`) }}</span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
