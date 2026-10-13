import type { JobContent } from '../content.js';
import { fragment, type Fragment } from './fold.js';

// Defensive on partially built content (tests, imports): a missing list has nothing to check.
const items = (path: string, texts: readonly string[] | undefined): readonly Fragment[] => (texts ?? []).map((text, i) => fragment(`${path}.${i}`, text));

/** Every free-text field of the ad, with its content path, in reading order. */
export function textFragments(content: JobContent): readonly Fragment[] {
  const single = (path: string, text: string | undefined): readonly Fragment[] => (text === undefined || text.trim() === '' ? [] : [fragment(path, text)]);
  return [
    fragment('title', content.title),
    ...single('summary', content.summary),
    ...items('responsibilities', content.responsibilities),
    ...items('requirements.mustHave', content.requirements?.mustHave),
    ...items('requirements.niceToHave', content.requirements?.niceToHave),
    ...items('benefits', content.benefits),
    ...single('growth', content.growth),
    ...single('workLifeBalance', content.workLifeBalance),
    ...single('culture', content.culture),
    ...content.process.flatMap((stage, i) => single(`process.${i}.note`, stage.note)),
    ...single('employment.bonus', content.employment?.bonus),
  ];
}
