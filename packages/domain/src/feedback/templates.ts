import type { Locale } from '../platform/config.js';
import type { StageType } from '../job/taxonomy.js';

/** One fixed question of a feedback form. The id is stable: answers are stored by id, never by text. */
export interface FeedbackQuestion {
  readonly id: string;
  readonly it: string;
  readonly en: string;
  /** A required question must have a non-blank answer. */
  readonly required: boolean;
}

const q = (id: string, it: string, en: string, required = true): FeedbackQuestion => ({ id, it, en, required });

const CANDIDATE_QUESTIONS = q('candidate_questions', 'Domande e dubbi del candidato', "The candidate's questions and doubts", false);

/**
 * Fixed questions per stage type (PLAN §5, Phase 9). They ask what was seen, never for a mark: there is no score and no
 * ranking anywhere in feedback (principle 4). The recommendation (`proceed | do_not_proceed | discuss`) is a separate,
 * mandatory field and an opinion for whoever decides.
 */
export const FEEDBACK_TEMPLATES: Readonly<Record<StageType, readonly FeedbackQuestion[]>> = {
  screening_call: [
    q('screening_motivation', 'Motivazione e aspettative espresse', 'Motivation and expectations expressed'),
    q('screening_constraints', 'Disponibilità e vincoli emersi', 'Availability and constraints that came up'),
    CANDIDATE_QUESTIONS,
  ],
  hr_interview: [
    q('hr_motivation', 'Motivazione e aspettative espresse', 'Motivation and expectations expressed'),
    q('hr_constraints', 'Disponibilità e vincoli emersi', 'Availability and constraints that came up'),
    q('hr_fit', 'Cosa è emerso su ruolo, team e modo di lavorare', 'What came up about the role, the team and ways of working', false),
    CANDIDATE_QUESTIONS,
  ],
  technical_interview: [
    q('tech_shown', 'Cosa ha mostrato sul piano tecnico', 'What they showed on the technical side'),
    q('tech_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  take_home_assignment: [
    q('assignment_delivered', 'Cosa ha consegnato e come è stato svolto', 'What was delivered and how it was done'),
    q('assignment_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  live_exercise: [
    q('exercise_shown', "Come ha affrontato l'esercizio", 'How they approached the exercise'),
    q('exercise_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  case_study: [
    q('case_shown', 'Come ha ragionato sul caso', 'How they reasoned about the case'),
    q('case_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  team_interview: [
    q('team_shown', 'Cosa è emerso nel confronto con il team', 'What came up in the conversation with the team'),
    q('team_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  manager_interview: [
    q('manager_shown', 'Cosa è emerso su esperienza e responsabilità', 'What came up about experience and responsibilities'),
    q('manager_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  final_interview: [
    q('final_shown', 'Cosa ha confermato o chiarito nel colloquio finale', 'What they confirmed or clarified in the final interview'),
    q('final_open', 'Cosa resta da approfondire', 'What is left to explore'),
    CANDIDATE_QUESTIONS,
  ],
  offer: [
    q('offer_reaction', "Come ha reagito all'offerta", 'How they reacted to the offer'),
    q('offer_open', 'Punti aperti da chiarire', 'Open points to clarify'),
  ],
};

/** Used when the stage no longer exists (removed after the request was made). */
export const FALLBACK_FEEDBACK_QUESTIONS: readonly FeedbackQuestion[] = [
  q('general_shown', 'Cosa è emerso nel colloquio', 'What came up in the conversation'),
  q('general_open', 'Cosa resta da approfondire', 'What is left to explore'),
];

export const feedbackQuestionsFor = (stageType: StageType | null): readonly FeedbackQuestion[] =>
  stageType === null ? FALLBACK_FEEDBACK_QUESTIONS : FEEDBACK_TEMPLATES[stageType];

export interface LocalizedQuestion {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
}

export const localizeQuestions = (questions: readonly FeedbackQuestion[], locale: Locale): readonly LocalizedQuestion[] =>
  questions.map((question) => ({ id: question.id, label: question[locale], required: question.required }));
