<script setup lang="ts">
import { NO_VALUE } from '@/lib/report-view'
import { originLabel } from '@/lib/origin-label'
import { sourceFilterOf, type SourceSummary } from '@/lib/traffic-view'

/**
 * Every source of the period with its campaigns: visits, applications and applications per 100 visits (shown from the
 * fifth visit). Pressing a source shows it alone in the chart and lists who applied through it.
 */
defineProps<{ summaries: readonly SourceSummary[]; selected: string }>()
const emit = defineEmits<{ select: [value: string] }>()
const { t } = useI18n()
const per100 = (value: number | null): string => (value === null ? NO_VALUE : String(value))
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm" data-testid="source-table">
      <caption class="sr-only">{{ t('trackedLinks.traffic.table.caption') }}</caption>
      <thead class="text-left text-xs text-muted-foreground">
        <tr class="border-b">
          <th scope="col" class="py-2 pr-3 font-medium">{{ t('trackedLinks.traffic.table.source') }}</th>
          <th scope="col" class="py-2 px-2 text-right font-medium">{{ t('trackedLinks.traffic.visits') }}</th>
          <th scope="col" class="py-2 px-2 text-right font-medium">{{ t('trackedLinks.traffic.applications') }}</th>
          <th scope="col" class="py-2 pl-2 text-right font-medium">{{ t('trackedLinks.traffic.table.per100') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in summaries" :key="row.origin">
          <tr class="border-b last:border-0" data-testid="source-table-row">
            <th scope="row" class="py-2 pr-3 text-left font-medium">
              <button
                type="button"
                class="text-link underline-offset-4 hover:underline aria-pressed:text-foreground aria-pressed:underline"
                :aria-pressed="selected === sourceFilterOf({ origin: row.origin, campaign: null })"
                @click="emit('select', sourceFilterOf({ origin: row.origin, campaign: null }))"
              >
                {{ originLabel(row.origin, t) }}
              </button>
            </th>
            <td class="figure py-2 px-2 text-right">{{ row.visits }}</td>
            <td class="figure py-2 px-2 text-right font-semibold">{{ row.applications }}</td>
            <td class="figure py-2 pl-2 text-right">{{ per100(row.conversion.per100) }}</td>
          </tr>
          <tr v-for="campaign in row.campaigns" :key="`${row.origin}|${campaign.campaign}`" class="border-b last:border-0 text-muted-foreground" data-testid="source-table-campaign">
            <th scope="row" class="py-1.5 pr-3 pl-4 text-left font-normal">
              <button
                type="button"
                class="font-mono text-xs underline-offset-4 hover:underline aria-pressed:text-foreground aria-pressed:underline"
                :aria-pressed="selected === sourceFilterOf({ origin: row.origin, campaign: campaign.campaign })"
                :aria-label="t('origin.withCampaign', { source: originLabel(row.origin, t), campaign: campaign.campaign })"
                @click="emit('select', sourceFilterOf({ origin: row.origin, campaign: campaign.campaign }))"
              >
                {{ campaign.campaign }}
              </button>
            </th>
            <td class="figure py-1.5 px-2 text-right">{{ campaign.visits }}</td>
            <td class="figure py-1.5 px-2 text-right">{{ campaign.applications }}</td>
            <td class="figure py-1.5 pl-2 text-right">{{ per100(campaign.conversion.per100) }}</td>
          </tr>
        </template>
      </tbody>
    </table>
    <p class="mt-2 text-xs text-muted-foreground">{{ t('trackedLinks.traffic.table.note') }}</p>
  </div>
</template>
