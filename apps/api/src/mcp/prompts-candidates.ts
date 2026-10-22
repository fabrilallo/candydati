import { ATTENTION_STATES } from '@candydati/domain';
import { z } from 'zod';
import { idArgument, withRules, type PromptDefinition } from './prompt-support.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Below this many cases a rate says little: the report says so instead of drawing a conclusion. */
const SMALL_SAMPLE = 10;

const inboxShape = { state: z.enum(ATTENTION_STATES).optional().describe('Optional: only overdue, or only due soon.') };

export const answerInboxPrompt = {
  name: 'answer_inbox',
  title: 'Answer the inbox',
  description: 'Go through the applications waiting for an answer, most urgent first, and prepare what you need to reply. You send from the app.',
  shape: inboxShape,
  text: ({ state }) =>
    withRules(
      'Help me answer the applications that are waiting for a reply.',
      '',
      'Steps:',
      `1. Call list_attention${state ? ` with state "${state}"` : ''}: most urgent first. If meta says there are more, ask before reading the next page.`,
      '2. For each application show the candidate\'s first name and id, the job, the stage and how close or late the promised answer is. ' +
        'Then list the options open to me: a status update, the next step of the declared process, or a final answer if I have already decided. Do not choose the outcome for me.',
      '3. If I ask, draft the message: short, respectful, addressing the candidate by first name. If a surname is needed, write the variable {{candidate.lastName}} as it is: the app fills it in. Never write a surname or a contact.',
      '4. There is no tool to send messages, move or close applications here: I review the draft and send it from the app, on the candidate\'s page.',
      '5. With my go-ahead you can record a reminder with add_candidate_note, or hand a reply to a colleague with create_task (ask me who).',
      '6. End with a short summary: how many are overdue and how many are due soon, each candidate named by first name and id.',
    ),
} satisfies PromptDefinition<typeof inboxShape>;

const findShape = { jobId: idArgument('The job ad to find candidates for (list_jobs).') };

export const findCandidatesPrompt = {
  name: 'find_candidates',
  title: 'Find candidates on declared criteria',
  description: 'Propose objective criteria from a job ad, wait for your confirmation, then filter its applicants and talent pool. A filter, never a ranking.',
  shape: findShape,
  text: ({ jobId }) =>
    withRules(
      `Help me find candidates for the job "${jobId}" on objective criteria.`,
      '',
      'Steps:',
      '1. Read the job with get_job.',
      '2. Propose criteria taken from the ad only, and say where each one comes from: skills (from the must-have requirements), languages, minimum years of experience, ' +
        'locations (from the work mode and city), keywords (words to find in the CV). Keep them few: every result must meet every criterion, so each one narrows the list.',
      '3. Leave out and refuse any protected characteristic or proxy for one (birth or graduation year, nationality, photo, family) and any maximum experience: it works as an age limit. If I ask for one, say why not.',
      '4. Wait for my explicit confirmation of these exact criteria before searching. If I change them, show the new list and wait again.',
      '5. Then call find_candidates_by_criteria with the job id, the confirmed criteria and confirmedByUser: true. It searches both the applicants and the talent pool unless I ask for one of them.',
      '6. Present the results as a plain list in the order they come in (most recent application first): first name, id, and whether the person is in the talent pool. ' +
        'Do not rank, compare, pick the best or comment on who fits most: every result meets every criterion, and that is all the list says.',
      '7. Always report notEvaluable: those CVs could not be checked, so a person must look at them. They are not excluded.',
      '8. What happens next (contacting, moving, deciding) stays with me, in the app.',
    ),
} satisfies PromptDefinition<typeof findShape>;

const reportShape = { jobId: idArgument('Optional: narrow the report to one job ad (list_jobs).').optional() };

export const weeklyReportPrompt = {
  name: 'weekly_report',
  title: 'Weekly report',
  description: 'Hiring figures for the last seven days, for the organization or one job: rates with their denominators, small samples flagged, no names.',
  shape: reportShape,
  text: ({ jobId }, now) =>
    withRules(
      `Prepare the weekly hiring report for ${jobId ? `the job "${jobId}"` : 'the whole organization'}.`,
      '',
      'Steps:',
      `1. Call get_reports with from "${new Date(now.getTime() - WEEK_MS).toISOString()}" and to "${now.toISOString()}"${jobId ? ` and jobId "${jobId}"` : ''}.`,
      '2. Call get_job_stats for the job ads: how many are published, how many drafts are blocked from publication and why.',
      '3. Write the report: applications received and by source, conversion between stages, response promises kept and missed, share of applications with an outcome, time to hire and to fill.',
      `4. Give every rate with its denominator ("3 of 4", not "75%" alone). Under ${SMALL_SAMPLE} cases, say the sample is small and draw no conclusion.`,
      '5. No names: numbers only. Do not read the pipeline to add people to the report. If I want a comparison, call get_reports for the seven days before; never invent a trend.',
      '6. End with at most three points the team could look at, about the process (missed promises, blocked drafts), never about a single candidate.',
    ),
} satisfies PromptDefinition<typeof reportShape>;
