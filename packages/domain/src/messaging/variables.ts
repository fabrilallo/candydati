/** The only names a template may use. Syntax: `{{ candidate.firstName }}`. */
export const TEMPLATE_VARIABLES = [
  'candidate.firstName',
  'candidate.lastName',
  'job.title',
  'organization.name',
  'stage.name',
  'job.responseDays',
  'job.url',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateValues = Readonly<Record<TemplateVariable, string>>;

export interface RenderResult {
  /** Plain text. Known variables are replaced; unknown ones stay as written. */
  readonly text: string;
  /** Names of the unknown variables, in order of first appearance, without duplicates. */
  readonly unknownVariables: readonly string[];
}

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

export const isTemplateVariable = (name: string): name is TemplateVariable =>
  (TEMPLATE_VARIABLES as readonly string[]).includes(name);

/**
 * Pure substitution: it looks names up in a fixed list and never evaluates anything (no expressions, no helpers, no
 * property paths beyond the list). The output is plain text: escaping for HTML is `textToHtml`'s job.
 */
export function renderTemplate(template: string, values: TemplateValues): RenderResult {
  const unknown: string[] = [];
  const text = template.replace(PLACEHOLDER, (original: string, raw: string) => {
    const name = raw.trim();
    if (isTemplateVariable(name)) return values[name];
    if (!unknown.includes(name)) unknown.push(name);
    return original;
  });
  return { text, unknownVariables: unknown };
}

/** Unknown variables of several texts, without duplicates. */
export const findUnknownVariables = (...templates: readonly string[]): readonly string[] =>
  [...new Set(templates.flatMap((template) => renderTemplate(template, EMPTY_VALUES).unknownVariables))];

const EMPTY_VALUES = Object.fromEntries(TEMPLATE_VARIABLES.map((name) => [name, ''])) as TemplateValues;
