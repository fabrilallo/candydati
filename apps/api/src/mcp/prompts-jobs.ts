import { z } from 'zod';
import { idArgument, withRules, type PromptDefinition } from './prompt-support.js';

/** Long enough for a pasted brief or an old ad, short enough to stay a brief. */
export const BRIEF_MAX = 4000;

const writeShape = {
  brief: z.string().trim().min(1).max(BRIEF_MAX).describe('What the role is: a few lines, notes from the hiring manager or an old ad.'),
  templateId: idArgument('Optional: a job ad template to start from (list_job_templates).').optional(),
};

function startStep(templateId: string | undefined): string {
  if (templateId) return `1. Start the draft with create_job from the template "${templateId}" (pass it as templateId), with a title taken from the brief.`;
  return '1. Call list_job_templates. If one fits the brief, propose it and start from it with create_job; otherwise create_job with a title taken from the brief. create_job only creates a draft.';
}

export const writeJobAdPrompt = {
  name: 'write_job_ad',
  title: 'Write a job ad',
  description: 'Draft a complete, publishable job ad from a brief: RAL range, declared process, Italian compliance checks. Publishes only after your explicit go-ahead.',
  shape: writeShape,
  text: ({ brief, templateId }) =>
    withRules(
      'Help me write a job ad. My brief, between the lines:',
      '---',
      brief,
      '---',
      '',
      'Steps:',
      startStep(templateId),
      '2. Complete the content: role, seniority, contract type, a salary range (RAL minimum and maximum), work mode (city and office days if hybrid or onsite), ' +
        'the selection process (every stage with type, duration and who conducts it), the days within which candidates hear back, at least three responsibilities and one must-have requirement.',
      '3. The RAL range and the declared selection process are mandatory. If the brief does not give them, ask me: never invent a figure, a stage or a deadline.',
      '4. Italian compliance: the title addresses both sexes ("(m/f)" or a form like "Sviluppatore/trice"); no requirement on age, sex, origin or nationality, appearance, family or religion; every requirement is tied to the job.',
      '5. Read the draft with get_job, save the complete content with update_job, then run check_publishable and fix every issue it lists. Run analyze_job_ad and rewrite vague phrases it points out.',
      '6. Show me the final ad and anything still open. The draft is the default outcome. Call publish_job only after the person explicitly says to publish this ad, in a message after seeing it.',
    ),
} satisfies PromptDefinition<typeof writeShape>;

const kitShape = { jobId: idArgument('The job ad the interviews are for (list_jobs).') };

export const interviewKitPrompt = {
  name: 'interview_kit',
  title: 'Interview kit',
  description: 'Questions for each declared stage of a job, tied to the ad\'s requirements, and a descriptive observation grid with no scores or ratings.',
  shape: kitShape,
  text: ({ jobId }) =>
    withRules(
      `Prepare an interview kit for the job "${jobId}".`,
      '',
      'Steps:',
      '1. Read the job with get_job: responsibilities, requirements and the declared selection process.',
      '2. For each declared stage, in order, propose three to five questions. Tie each one to a requirement or responsibility of the ad and say which. Every candidate of a stage gets the same questions.',
      '3. For each stage, an observation grid: one row per requirement, where the interviewer writes facts and examples the candidate gave, and what was not covered. ' +
        'Descriptive only: no scores, ratings, stars, numeric scales, pass or fail fields. A person decides after reading the notes.',
      '4. No question touches a protected characteristic or private life, not even indirectly (year of graduation for age, plans for children, where the family is from).',
      '5. If the process declares no stages, say so and suggest completing it in the ad first. The kit is a text for me: nothing is saved.',
    ),
} satisfies PromptDefinition<typeof kitShape>;
