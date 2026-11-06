import type { AttachPackResultDto, AutomationPack, AutomationPackDto, AutomationPackRule, AutomationPackRuleDto } from '@candydati/domain';
import type { AttachPackResult } from '../use-cases/automations/attach-pack.js';
import type { PackSummary } from '../use-cases/automations/packs.js';

export const toAutomationPackDto = (pack: AutomationPack, ruleCount = 0, templateIds: readonly string[] = []): AutomationPackDto => ({
  id: pack.id,
  name: pack.name,
  description: pack.description,
  ruleCount,
  templateIds: [...templateIds],
  createdBy: pack.createdBy,
  createdAt: pack.createdAt.toISOString(),
  updatedAt: pack.updatedAt.toISOString(),
});

export const toPackSummaryDto = ({ pack, ruleCount, templateIds }: PackSummary): AutomationPackDto => toAutomationPackDto(pack, ruleCount, templateIds);

export const toAutomationPackRuleDto = (rule: AutomationPackRule): AutomationPackRuleDto => ({
  id: rule.id,
  packId: rule.packId,
  stage: rule.stage,
  trigger: rule.trigger,
  conditions: rule.conditions,
  action: rule.action,
  enabled: rule.enabled,
  createdBy: rule.createdBy,
  createdAt: rule.createdAt.toISOString(),
});

export const toAttachPackResultDto = (result: AttachPackResult): AttachPackResultDto => ({
  packId: result.packId,
  created: [...result.created],
  updated: [...result.updated],
  removed: result.removed,
  skipped: result.skipped.map((s) => ({ ...s })),
});
