import type { JobContent } from '@tt/domain';

export type FragmentKey =
  | 'title'
  | 'summary'
  | 'responsibilities'
  | 'requirements'
  | 'technologies'
  | 'benefits'
  | 'growth'
  | 'workLifeBalance'
  | 'culture'
  | 'processNotes';

/** One piece of free text of the ad: a field or a single list item. */
export interface Fragment {
  readonly key: FragmentKey;
  readonly text: string;
}

const of = (key: FragmentKey, texts: readonly (string | undefined)[]): readonly Fragment[] =>
  texts.filter((text): text is string => text !== undefined && text.trim().length > 0).map((text) => ({ key, text }));

/** Every free-text field and list item of the ad, in reading order. */
export const fragmentsOf = (content: JobContent): readonly Fragment[] => [
  ...of('title', [content.title]),
  ...of('summary', [content.summary]),
  ...of('responsibilities', content.responsibilities),
  ...of('requirements', [...content.requirements.mustHave, ...content.requirements.niceToHave]),
  ...of('technologies', content.technologies),
  ...of('benefits', content.benefits),
  ...of('growth', [content.growth]),
  ...of('workLifeBalance', [content.workLifeBalance]),
  ...of('culture', [content.culture]),
  ...of('processNotes', content.process.map((stage) => stage.note)),
];
