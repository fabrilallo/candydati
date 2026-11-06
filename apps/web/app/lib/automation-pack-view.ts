import { RECEIVED_STAGE_ID, STAGE_ANCHORS, type AttachPackResultDto, type AutomationPackRuleDto, type AutomationPackRuleInput, type StageAnchor } from '@candydati/domain'
import { actionToForm } from './automation-action-view'
import { triggerToForm } from './automation-trigger-view'
import { EMPTY_RULE_FORM, validateRuleForm, type RuleForm, type RuleFormErrors } from './automation-view'

/** Pure: the translation key of an anchor, the same one the board uses for a stage of that type. */
export const anchorLabelKey = (anchor: StageAnchor): string => (anchor === RECEIVED_STAGE_ID ? 'pipeline.received' : `taxonomy.stageTypes.${anchor}`)

/** Pure: where a rule can be anchored; with `exclude`, where its proposed move can go (never back to received). */
export const anchorOptions = (exclude: StageAnchor | null): readonly StageAnchor[] =>
  exclude === null ? STAGE_ANCHORS : STAGE_ANCHORS.filter((anchor) => anchor !== exclude && anchor !== RECEIVED_STAGE_ID)

export interface AnchorGroup {
  readonly anchor: StageAnchor
  readonly rules: readonly AutomationPackRuleDto[]
}

/** Pure: the rules of a pack per anchor, in pipeline order and then by creation; anchors without rules are left out. */
export const rulesByAnchor = (rules: readonly AutomationPackRuleDto[]): readonly AnchorGroup[] =>
  STAGE_ANCHORS.map((anchor) => ({ anchor, rules: rules.filter((rule) => rule.stage === anchor).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)) })).filter((group) => group.rules.length > 0)

export const packRuleToForm = (rule: AutomationPackRuleDto): RuleForm => ({ ...EMPTY_RULE_FORM, ...triggerToForm(rule), ...actionToForm(rule.action) })

export type PackRuleFormErrors = RuleFormErrors & { readonly stage?: string }

/** Pure: like a job rule form, with the stage an anchor that must be chosen. */
export const validatePackRuleForm = (form: RuleForm, stage: StageAnchor | '', enabled: boolean): { readonly errors: PackRuleFormErrors; readonly input: AutomationPackRuleInput | null } => {
  const { errors, input } = validateRuleForm(form, stage, enabled)
  if (stage === '') return { errors: { ...errors, stage: 'automationPacks.errors.stageRequired' }, input: null }
  if (!input) return { errors, input: null }
  const { stageId: _stageId, ...rest } = input
  return { errors, input: { ...rest, stage } }
}

/** Pure: the toast after an attach: what was created and updated, and how many rules found no place. */
export const attachToast = (result: AttachPackResultDto): { readonly key: string; readonly params: Readonly<Record<string, number>> } => ({
  key: result.skipped.length > 0 ? 'automationPacks.attach.doneWithSkips' : 'automationPacks.attach.done',
  params: { created: result.created.length, updated: result.updated.length, skipped: result.skipped.length },
})
