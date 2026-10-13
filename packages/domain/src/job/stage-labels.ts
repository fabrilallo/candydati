import type { Locale } from '../platform/config.js';
import type { StageType } from './taxonomy.js';

/**
 * Stage type labels for text the server writes in the ad's language: emails to candidates and interviewers, the public
 * feedback page, the assistant. The web app has its own translations for the interface; these must stay in step.
 */
export const STAGE_TYPE_LABELS: Readonly<Record<Locale, Readonly<Record<StageType, string>>>> = {
  it: {
    screening_call: 'Chiamata conoscitiva',
    hr_interview: 'Colloquio HR',
    technical_interview: 'Colloquio tecnico',
    take_home_assignment: 'Esercizio da svolgere a casa',
    live_exercise: 'Esercizio dal vivo',
    case_study: 'Caso di studio',
    team_interview: 'Colloquio con il team',
    manager_interview: 'Colloquio con il responsabile',
    final_interview: 'Colloquio finale',
    offer: 'Offerta',
  },
  en: {
    screening_call: 'Screening call',
    hr_interview: 'HR interview',
    technical_interview: 'Technical interview',
    take_home_assignment: 'Take-home assignment',
    live_exercise: 'Live exercise',
    case_study: 'Case study',
    team_interview: 'Team interview',
    manager_interview: 'Manager interview',
    final_interview: 'Final interview',
    offer: 'Offer',
  },
};

/** The stage's own title when the recruiter gave one, otherwise the type in the given language. */
export const stageDisplayName = (stage: { readonly type: StageType; readonly title?: string | undefined }, locale: Locale): string =>
  stage.title ?? STAGE_TYPE_LABELS[locale][stage.type];
