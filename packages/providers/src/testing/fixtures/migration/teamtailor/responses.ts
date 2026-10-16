/**
 * Teamtailor API responses for the connector tests. Every record is built from the examples in the public docs
 * (https://docs.teamtailor.com/ and the reference mirror https://teamtailor-docs.netlify.app/); each block names its
 * section. Ids, names and emails are the docs' own placeholders. Where the docs show only `links` for a relationship, the
 * linkage (`data: { id, type }`) the connector asks for with `include` is added, in the JSON:API form the docs' "create
 * Job Application" example uses (https://teamtailor-docs.netlify.app/#job-applications).
 */
export interface FixtureResource {
  readonly id: string | number;
  readonly type: string;
  readonly attributes: Record<string, unknown>;
  readonly relationships?: Record<string, unknown>;
}

const link = (type: string, id: string) => ({ data: { id, type } });
const linksOnly = (path: string) => ({ links: { related: `https://api.teamtailor.com/v1/${path}` } });

/** Users: https://teamtailor-docs.netlify.app/#users (User Object). */
export const users = (): FixtureResource[] => [
  {
    id: '4468',
    type: 'users',
    attributes: { email: 'jonas@example.com', 'login-email': 'jonas@example.com', name: 'Jonas Brusman', role: 'admin', title: 'Developer', picture: { standard: 'https://example.com/p.jpg' } },
  },
];

/** Jobs: https://teamtailor-docs.netlify.app/#jobs (Job Object: status open, created-at). A second one is archived. */
export const jobs = (): FixtureResource[] => [
  { id: '7199', type: 'jobs', attributes: { title: 'Marketing Manager', status: 'open', 'created-at': '2016-11-17T00:00:00.000+01:00', 'human-status': 'scheduled', body: '<p>Job body HTML goes here.</p>', tags: ['JavaScript', 'Ruby'] } },
  { id: '7200', type: 'jobs', attributes: { title: 'Developer', status: 'archived', 'created-at': '2016-10-01T00:00:00.000+01:00' } },
];

/**
 * Stages: https://teamtailor-docs.netlify.app/#stages (Inbox / In process / Hired are the documented stage types;
 * `row-order` -4194303 and 4194304 are the docs' values). Sent unsorted on purpose.
 */
export const stagesOf = (jobId: string): FixtureResource[] => [
  { id: `${jobId}-8`, type: 'stages', attributes: { name: 'Reviewing', 'stage-type': 'In process', 'row-order': 4194304 } },
  { id: `${jobId}-5`, type: 'stages', attributes: { name: 'Inbox', 'stage-type': 'Inbox', 'row-order': -4194303 } },
  { id: `${jobId}-9`, type: 'stages', attributes: { name: 'Hired', 'stage-type': 'Hired', 'row-order': 8388607 } },
];

/** Candidates: https://teamtailor-docs.netlify.app/#candidates (Candidate Object, List Candidates). `resume` URLs are replaced by the test's own server. */
export const candidates = (fileBase: string): FixtureResource[] => [
  {
    id: '1337',
    type: 'candidates',
    attributes: {
      connected: true,
      'created-at': '2017-01-18T21:04:56.178+01:00',
      email: 'john.doe@example.com',
      'first-name': 'John',
      'last-name': 'Doe',
      'linkedin-url': 'https://www.linkedin.com/pub/johndoe',
      phone: '0700000000',
      picture: 'https://image.jpg',
      pitch: 'I like turtles',
      'referring-site': 'Facebook',
      resume: `${fileBase}/files/resume.pdf`,
      'original-resume': `${fileBase}/files/resume.docx`,
      tags: ['turtles'],
    },
    relationships: { answers: { ...linksOnly('candidates/1337/answers'), data: [] } },
  },
  {
    id: '1106',
    type: 'candidates',
    attributes: { 'created-at': '2015-04-21T10:34:35.109+02:00', email: 'candidate@example.com', 'first-name': 'John', 'last-name': 'Doe', phone: '', 'original-resume': null, resume: null, tags: [] },
  },
  { id: '576', type: 'candidates', attributes: { 'created-at': '2015-04-22T19:39:32.902+02:00', email: 'candidate2@example.com', 'first-name': 'Jane', 'last-name': 'Doe', resume: `${fileBase}/files/missing.pdf` } },
];

/** Job applications: https://teamtailor-docs.netlify.app/#job-applications (Object and List: dates, cover-letter, referring-site, sourced). */
export const applications = (): FixtureResource[] => [
  {
    id: '1337',
    type: 'job-applications',
    attributes: { 'created-at': '2017-02-20T10:30:43.910+01:00', 'cover-letter': 'Dear Sir/Madam…', 'rejected-at': null, 'referring-site': 'Facebook', sourced: false, 'changed-stage-at': '2017-03-01T11:29:48.841+01:00' },
    relationships: { candidate: link('candidates', '1337'), job: link('jobs', '7199'), stage: link('stages', '7199-8') },
  },
  {
    id: '1338',
    type: 'job-applications',
    attributes: { 'created-at': '2015-04-21T10:34:35.109+02:00', 'cover-letter': '', 'rejected-at': '2015-09-09T11:26:34.025+02:00', 'referring-site': 'Indeed Sweden', sourced: false, 'changed-stage-at': '2017-01-11T11:29:48.841+01:00' },
    relationships: { candidate: link('candidates', '1106'), job: link('jobs', '7200'), stage: link('stages', '7200-5'), 'reject-reason': link('reject-reasons', '1') },
  },
  {
    id: '1339',
    type: 'job-applications',
    attributes: { 'created-at': '2015-04-22T19:39:32.902+02:00', 'rejected-at': '2015-09-09T11:26:33.991+02:00', sourced: true, 'changed-stage-at': '2015-09-01T11:26:33.991+02:00' },
    relationships: { candidate: link('candidates', '576'), job: link('jobs', '7200'), stage: link('stages', '7200-8'), 'reject-reason': link('reject-reasons', '2') },
  },
  {
    id: '1340',
    type: 'job-applications',
    attributes: { 'created-at': '2015-05-01T10:00:00.000+02:00', sourced: true, 'changed-stage-at': '2015-06-01T10:00:00.000+02:00' },
    relationships: { candidate: link('candidates', '576'), job: link('jobs', '7200'), stage: link('stages', '7200-9') },
  },
];

/** Reject reasons: https://teamtailor-docs.netlify.app/#reject-reasons (`reason`, `rejected-by-company`). */
export const rejectReasons = (): FixtureResource[] => [
  { id: '1', type: 'reject-reasons', attributes: { reason: 'Not a fit', 'rejected-by-company': true } },
  { id: '2', type: 'reject-reasons', attributes: { reason: 'Took another job', 'rejected-by-company': false } },
];

/** Questions: https://teamtailor-docs.netlify.app/#questions (Question Object: title, question-type). */
export const questions = (): FixtureResource[] => [
  { id: '1337', type: 'questions', attributes: { 'question-type': 'Text', title: 'Can you describe your ideal work environment?' } },
  { id: '44221', type: 'questions', attributes: { 'question-type': 'Boolean', title: 'Have you ever worked with sales before?' } },
  { id: '5', type: 'questions', attributes: { 'question-type': 'Choice', title: 'Pick one', alternatives: ['a', 'b'] } },
];

/** Answers: https://teamtailor-docs.netlify.app/#answers (Answer Object: text, boolean, choices, range). */
export const answers = (): FixtureResource[] => [
  { id: '1337', type: 'answers', attributes: { boolean: null, choices: [], range: null, text: 'Dear Sir/Madam…' }, relationships: { question: link('questions', '1337'), candidate: link('candidates', '1337') } },
  { id: '1338', type: 'answers', attributes: { boolean: true, choices: [], range: null, text: null }, relationships: { question: link('questions', '44221'), candidate: link('candidates', '1337') } },
  { id: '1339', type: 'answers', attributes: { boolean: null, choices: [3, 4], range: null, text: null }, relationships: { question: link('questions', '5'), candidate: link('candidates', '1337') } },
];

/** Uploads: https://teamtailor-docs.netlify.app/#uploads (Upload Object: url, file-name, internal; relations candidate and job). */
export const uploads = (fileBase: string): FixtureResource[] => [
  { id: '446842', type: 'uploads', attributes: { url: `${fileBase}/files/cover_letter.pdf`, 'file-name': 'cover_letter.pdf', internal: false }, relationships: { candidate: link('candidates', '1337'), job: link('jobs', '7199') } },
  { id: '446843', type: 'uploads', attributes: { url: `${fileBase}/files/gone.pdf`, 'file-name': 'gone.pdf', internal: true }, relationships: { candidate: link('candidates', '1337'), job: link('jobs', '7199') } },
  { id: '446844', type: 'uploads', attributes: { url: `${fileBase}/files/orphan.pdf`, 'file-name': 'orphan.pdf', internal: false }, relationships: { candidate: link('candidates', '9999') } },
];

/**
 * Notes: https://teamtailor-docs.netlify.app/#notes (Note Object: note, user-id, candidate-id, private-note, created-at).
 * The docs list them as `{ "notes": [ { "data": {...} } ] }`: this fixture keeps that shape in `notesDocShape`.
 */
export const notes = (): FixtureResource[] => [
  { id: 1, type: 'notes', attributes: { note: 'Example note', 'user-id': 4468, 'candidate-id': 1337, 'created-by-trigger': false, 'mentioned-user-ids': [], 'private-note': false, 'created-at': '2020-07-16T11:31:22.389+02:00' } },
  { id: 2, type: 'notes', attributes: { note: 'Only for the team', 'user-id': 77, 'candidate-id': 1106, 'private-note': true, 'created-at': '2020-07-17T11:31:22.389+02:00' } },
  { id: 3, type: 'notes', attributes: { note: 'Nobody knows them', 'user-id': 4468, 'candidate-id': 9999, 'private-note': false, 'created-at': '2020-07-18T11:31:22.389+02:00' } },
];
export const notesDocShape = (items: readonly FixtureResource[]) => ({ notes: items.map((data) => ({ data })) });
