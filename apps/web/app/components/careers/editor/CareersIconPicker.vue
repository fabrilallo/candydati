<script setup lang="ts">
import { VALUE_ICONS, type ValueIcon } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { valueIcon } from '@/lib/careers-icons'

/** The icon of a value: the curated set only, shown as a grid; each icon has its name for screen readers. */
const props = defineProps<{ id: string; modelValue: ValueIcon; testid?: string }>()
const emit = defineEmits<{ 'update:modelValue': [icon: ValueIcon] }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-1.5">
    <p :id="`${id}-label`" class="text-sm font-medium">{{ t('careersEditor.values.icon') }}</p>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button :id="id" type="button" variant="outline" size="sm" class="w-fit" :aria-labelledby="`${id}-label ${id}`" :data-testid="testid">
          <component :is="valueIcon(props.modelValue)" aria-hidden="true" />
          {{ t(`careersEditor.icons.${props.modelValue}`) }}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="grid w-72 grid-cols-6 gap-0.5">
        <DropdownMenuItem
          v-for="icon in VALUE_ICONS"
          :key="icon"
          class="grid size-10 place-items-center p-0"
          :class="icon === modelValue ? 'bg-accent text-accent-foreground' : ''"
          :aria-label="t(`careersEditor.icons.${icon}`)"
          :aria-checked="icon === modelValue"
          role="menuitemradio"
          :data-testid="`careers-icon-${icon}`"
          @select="emit('update:modelValue', icon)"
        >
          <component :is="valueIcon(icon)" class="size-5" aria-hidden="true" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
