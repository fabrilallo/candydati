<script setup lang="ts">
import { CAREERS_LIMITS, LINK_KINDS, type LinkKind, type SectionOf } from '@tt/domain'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { moveItem, removeAt, replaceAt, type SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** From one to eight links (site, social profiles): web addresses only, with an optional label. */
const props = defineProps<{ section: SectionOf<'links'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'links'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
type Item = SectionOf<'links'>['items'][number]

const items = (next: readonly Item[]): void => emit('patch', { items: [...next] })
const set = (index: number, patch: Partial<Item>): void => {
  const current = props.section.items[index]
  if (current) items(replaceAt(props.section.items, index, { ...current, ...patch }))
}
const asKind = (value: string): LinkKind => LINK_KINDS.find((kind) => kind === value) ?? 'other'
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :hint="t('careersEditor.links.titleHint', { title: t('careersSite.links.title') })" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersItemList
      :id="id('items')"
      :label="t('careersEditor.links.items')"
      :items="section.items"
      :max="8"
      :add-label="t('careersEditor.links.add')"
      :item-label="(index) => t('careersEditor.links.item', { n: index + 1 })"
      :error="issues.items"
      testid="careers-links"
      @add="items([...section.items, { kind: 'website', url: '', label: {} }])"
      @move="(from, to) => items(moveItem(section.items, from, to))"
      @remove="(index) => items(removeAt(section.items, index))"
    >
      <template #default="{ item, index }">
        <div class="grid gap-1.5">
          <Label :for="id(`kind-${index}`)">{{ t('careersEditor.links.kind') }}</Label>
          <NativeSelect :id="id(`kind-${index}`)" :model-value="item.kind" :data-testid="`careers-field-links-kind-${index}`" @update:model-value="set(index, { kind: asKind($event) })">
            <option v-for="kind in LINK_KINDS" :key="kind" :value="kind">{{ t(`careersSite.links.kinds.${kind}`) }}</option>
          </NativeSelect>
        </div>
        <CareersPlainField :id="id(`url-${index}`)" :label="t('careersEditor.links.url')" :model-value="item.url" :max="CAREERS_LIMITS.url" type="url" inputmode="url" placeholder="https://" :error="issues[`items.${index}.url`]" :testid="`careers-field-links-url-${index}`" @update:model-value="set(index, { url: $event.trim() })" />
        <CareersLocalizedField :id="id(`label-${index}`)" :label="t('careersEditor.links.label')" :model-value="item.label" :max="CAREERS_LIMITS.linkLabel" :error="issues[`items.${index}.label`]" :testid="`careers-field-links-label-${index}`" @update:model-value="set(index, { label: $event })" />
      </template>
    </CareersItemList>
  </div>
</template>
