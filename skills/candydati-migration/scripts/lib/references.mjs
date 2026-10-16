/** The cross-reference rules the product applies on top of the JSON Schema (`checkMigrationReferences`). */

export const FILES_DIR = 'files/';
export const LIMITS = { files: 10_000, totalBytes: 1024 ** 3 };

/** A relative path under `files/`: no `..` or `.` segment, no empty segment, no backslash, no control character. */
export function isFilePath(path) {
  if (!path.startsWith(FILES_DIR) || path.length > 500) return false;
  if (path.includes('\\') || /\p{Cc}/u.test(path)) return false;
  return path.slice(FILES_DIR.length).split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

const before = (later, earlier) => Date.parse(later) < Date.parse(earlier);
const list = (value) => (Array.isArray(value) ? value : []);

function uniqueRefs(items, path, issues) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item.ref)) issues.push({ path: [...path, index, 'ref'], message: `duplicate ref "${item.ref}": refs must be unique` });
    seen.add(item.ref);
  });
  return seen;
}

function checkJobs(pkg, issues) {
  uniqueRefs(list(pkg.jobs), ['jobs'], issues);
  const stagesByJob = new Map();
  list(pkg.jobs).forEach((job, index) => {
    stagesByJob.set(job.ref, uniqueRefs(list(job.stages), ['jobs', index, 'stages'], issues));
    if (job.closedAt === undefined) return;
    if (job.status !== 'closed') issues.push({ path: ['jobs', index, 'closedAt'], message: 'closedAt is only allowed when status is "closed"' });
    if (before(job.closedAt, job.createdAt)) issues.push({ path: ['jobs', index, 'closedAt'], message: 'closedAt is before createdAt' });
  });
  return stagesByJob;
}

function checkCandidates(pkg, issues) {
  list(pkg.candidates).forEach((candidate, index) => {
    const consent = candidate.consent;
    if (consent?.expiresAt !== undefined && before(consent.expiresAt, consent.givenAt)) {
      issues.push({ path: ['candidates', index, 'consent', 'expiresAt'], message: 'expiresAt is before givenAt' });
    }
  });
  return uniqueRefs(list(pkg.candidates), ['candidates'], issues);
}

function checkFiles(application, index, seenPaths, issues) {
  let cvs = 0;
  list(application.files).forEach((file, fileIndex) => {
    const path = ['applications', index, 'files', fileIndex, 'path'];
    if (typeof file.path !== 'string') return;
    if (!isFilePath(file.path)) issues.push({ path, message: `"${file.path}" is not a safe path under files/ (no "..", no absolute path, no backslash)` });
    if (seenPaths.has(file.path)) issues.push({ path, message: `"${file.path}" is used by more than one file entry` });
    seenPaths.add(file.path);
    if (file.kind === 'cv') cvs += 1;
  });
  if (cvs > 1) issues.push({ path: ['applications', index, 'files'], message: 'more than one file of kind "cv" in one application' });
}

function checkDates(application, index, issues) {
  const { outcome, closedAt, createdAt } = application;
  if (outcome !== undefined && closedAt === undefined) issues.push({ path: ['applications', index, 'closedAt'], message: 'closedAt is required when there is an outcome' });
  if (outcome === undefined && closedAt !== undefined) issues.push({ path: ['applications', index, 'outcome'], message: 'outcome is required when there is a closedAt' });
  if (closedAt !== undefined && before(closedAt, createdAt)) issues.push({ path: ['applications', index, 'closedAt'], message: 'closedAt is before createdAt' });
}

function checkApplication(application, index, known, issues) {
  const at = (...rest) => ['applications', index, ...rest];
  if (!known.candidates.has(application.candidateRef)) issues.push({ path: at('candidateRef'), message: `no candidate has ref "${application.candidateRef}"` });
  const stages = known.stagesByJob.get(application.jobRef);
  if (stages === undefined) {
    issues.push({ path: at('jobRef'), message: `no job has ref "${application.jobRef}"` });
    return;
  }
  if (!stages.has(application.stageRef)) issues.push({ path: at('stageRef'), message: `"${application.stageRef}" is not a stage of job "${application.jobRef}"` });
  list(application.stageHistory).forEach((entry, i) => {
    if (!stages.has(entry.stageRef)) issues.push({ path: at('stageHistory', i, 'stageRef'), message: `"${entry.stageRef}" is not a stage of job "${application.jobRef}"` });
  });
}

function checkApplications(pkg, known, issues) {
  uniqueRefs(list(pkg.applications), ['applications'], issues);
  const seenPaths = new Set();
  const candidateOf = new Map();
  list(pkg.applications).forEach((application, index) => {
    candidateOf.set(application.ref, application.candidateRef);
    checkApplication(application, index, known, issues);
    checkDates(application, index, issues);
    checkFiles(application, index, seenPaths, issues);
  });
  if (seenPaths.size > LIMITS.files) issues.push({ path: ['applications'], message: `more than ${LIMITS.files} files: split the account into several packages` });
  return { candidateOf, filePaths: seenPaths };
}

function checkNotes(pkg, candidates, candidateOf, issues) {
  const users = uniqueRefs(list(pkg.users), ['users'], issues);
  list(pkg.notes).forEach((note, index) => {
    const at = (field) => ['notes', index, field];
    if (!candidates.has(note.candidateRef)) issues.push({ path: at('candidateRef'), message: `no candidate has ref "${note.candidateRef}"` });
    if (note.authorRef !== undefined && !users.has(note.authorRef)) issues.push({ path: at('authorRef'), message: `no user has ref "${note.authorRef}"` });
    if (note.applicationRef === undefined) return;
    const owner = candidateOf.get(note.applicationRef);
    if (owner === undefined) issues.push({ path: at('applicationRef'), message: `no application has ref "${note.applicationRef}"` });
    else if (owner !== note.candidateRef) issues.push({ path: at('applicationRef'), message: 'the application belongs to another candidate' });
  });
}

/** Returns `{ issues, filePaths }`: the problems found and every file path the package references. */
export function checkReferences(pkg) {
  const issues = [];
  const stagesByJob = checkJobs(pkg, issues);
  const candidates = checkCandidates(pkg, issues);
  const { candidateOf, filePaths } = checkApplications(pkg, { stagesByJob, candidates }, issues);
  checkNotes(pkg, candidates, candidateOf, issues);
  list(pkg.messages).forEach((message, index) => {
    if (!candidateOf.has(message.applicationRef)) issues.push({ path: ['messages', index, 'applicationRef'], message: `no application has ref "${message.applicationRef}"` });
  });
  return { issues, filePaths };
}
