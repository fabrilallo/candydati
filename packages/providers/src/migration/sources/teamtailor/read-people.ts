import { fileNameFromUrl, mapAnswer, mapCandidate, mapNote } from './map.js';
import { storeFile, type FileCounts } from './read-files.js';
import type { KeptApplication } from './read-structure.js';
import { attempt, type Run } from './run.js';
import { linkedId } from './schemas.js';

type FormAnswer = { readonly question: string; readonly answer: string };

/** Application form answers by candidate. Teamtailor ties them to the candidate, not to one application. */
export async function readAnswers(run: Run): Promise<ReadonlyMap<string, readonly FormAnswer[]>> {
  const titles = new Map<string, string | undefined>();
  for await (const question of run.client.list('/questions', 'questions', {}, run.tick)) titles.set(question.id, question.attributes.title ?? undefined);
  const byCandidate = new Map<string, FormAnswer[]>();
  for await (const answer of run.client.list('/answers', 'answers', { include: 'candidate,question' }, run.tick)) {
    const candidateId = linkedId(answer, 'candidate');
    const questionId = linkedId(answer, 'question');
    const mapped = mapAnswer(answer, questionId === undefined ? undefined : titles.get(questionId));
    if (candidateId === undefined || mapped === undefined) continue;
    byCandidate.set(candidateId, [...(byCandidate.get(candidateId) ?? []), mapped]);
  }
  return byCandidate;
}

export interface AddedPeople {
  /** Candidate id -> the applications that went into the package. */
  readonly applicationsOf: ReadonlyMap<string, readonly KeptApplication[]>;
  readonly files: FileCounts;
}

const latest = (applications: readonly KeptApplication[]): KeptApplication | undefined =>
  applications.reduce<KeptApplication | undefined>((best, next) => (best === undefined || Date.parse(next.item.createdAt) >= Date.parse(best.item.createdAt) ? next : best), undefined);

/** The application an upload belongs to: the candidate's one for the upload's job, else the latest. */
export const applicationForUpload = (applications: readonly KeptApplication[], jobId: string | undefined): KeptApplication | undefined =>
  applications.find((application) => application.jobId === jobId) ?? latest(applications);

/**
 * Adds each candidate with its applications. The CV (`resume`, else `original-resume`) and the form answers go to the
 * candidate's latest application, since Teamtailor ties them to the person. Applications whose candidate was not
 * listed are counted as left out.
 */
export async function readCandidates(run: Run, applications: ReadonlyMap<string, readonly KeptApplication[]>, answers: ReadonlyMap<string, readonly FormAnswer[]>): Promise<AddedPeople> {
  const applicationsOf = new Map<string, readonly KeptApplication[]>();
  const files: FileCounts = new Map();
  for await (const candidate of run.client.list('/candidates', 'candidates', {}, run.tick)) {
    if (!(await attempt(() => run.builder.addCandidate(mapCandidate(candidate, run.now))))) {
      run.report.candidatesSkipped += 1;
      continue;
    }
    run.report.candidates += 1;
    const own = applications.get(candidate.id) ?? [];
    const main = latest(own);
    const added: KeptApplication[] = [];
    for (const application of own) {
      const item = application === main ? { ...application.item, answers: [...(answers.get(candidate.id) ?? [])] } : application.item;
      if (await attempt(() => run.builder.addApplication(item))) {
        added.push(application);
        run.report.applications += 1;
        if (application === main) run.report.answers += item.answers?.length ?? 0;
      } else run.report.applicationsSkipped += 1;
    }
    applicationsOf.set(candidate.id, added);
    const cv = candidate.attributes.resume ?? candidate.attributes['original-resume'];
    const target = latest(added);
    if (cv && target !== undefined) await storeFile(run, files, target.item.ref, { kind: 'cv', fileName: fileNameFromUrl(cv, 'cv.pdf') }, cv);
  }
  for (const [candidateId, kept] of applications) if (!applicationsOf.has(candidateId)) run.report.applicationsSkipped += kept.length;
  return { applicationsOf, files };
}

/** Files uploaded to candidates (`url` valid for 1 minute): attached to the application of their job, else the latest. */
export async function readUploads(run: Run, people: AddedPeople): Promise<void> {
  for await (const upload of run.client.list('/uploads', 'uploads', { include: 'candidate,job' }, run.tick)) {
    const url = upload.attributes.url;
    const candidateId = linkedId(upload, 'candidate');
    const target = candidateId === undefined ? undefined : applicationForUpload(people.applicationsOf.get(candidateId) ?? [], linkedId(upload, 'job'));
    if (!url || target === undefined) {
      run.report.filesSkipped += 1;
      continue;
    }
    await storeFile(run, people.files, target.item.ref, { kind: 'other', fileName: upload.attributes['file-name']?.trim() || fileNameFromUrl(url, 'file') }, url);
  }
}

/** Notes belong to a candidate, not to an application. */
export async function readNotes(run: Run, people: AddedPeople, users: ReadonlySet<string>): Promise<void> {
  for await (const note of run.client.list('/notes', 'notes', {}, run.tick)) {
    const mapped = mapNote(note, users);
    const known = mapped !== undefined && people.applicationsOf.has(mapped.candidateRef);
    if (known && (await attempt(() => run.builder.addNote(mapped)))) run.report.notes += 1;
    else run.report.notesSkipped += 1;
  }
}
