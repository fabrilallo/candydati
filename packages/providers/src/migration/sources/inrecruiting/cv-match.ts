import { fileStem, nameFromFileName, nameKey, normalizeEmail, normalizeText } from '@candydati/domain';

/** What the matching needs to know about one application. */
export interface CvSubject {
  readonly applicationRef: string;
  readonly candidateRef: string;
  /** The file cell of the row (names separated by `,` `;` `|` or a line break). */
  readonly fileCell: string | null;
  readonly email: string | null;
  readonly fullName: string;
}

export interface CvMatches {
  /** The CV (index into the archive's CV list) chosen for each application. */
  readonly byApplication: ReadonlyMap<string, number>;
  /** CVs no application claimed. */
  readonly unmatched: number;
}

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;
const cellNames = (cell: string | null): readonly string[] => (cell ?? '').split(/[,;|\n]+/).map((name) => name.trim()).filter((name) => name !== '');

/** Whole-word containment on normalised text: `ada.bianchi@example.com` is in `ada bianchi example com cv`. */
const contains = (haystack: string, needle: string): boolean => needle !== '' && ` ${haystack} `.includes(` ${needle} `);

/** 1. The row names the file: the same path, or the same name without extension, accents and case. */
function byFileCell(subject: CvSubject, paths: readonly string[], used: ReadonlySet<number>): number | null {
  for (const name of cellNames(subject.fileCell)) {
    const wanted = normalizeText(name);
    const index = paths.findIndex((path, i) => !used.has(i) && (normalizeText(path) === wanted || fileStem(path) === fileStem(name)));
    if (index >= 0) return index;
  }
  return null;
}

/** 2. The email is in the file name. */
function byEmail(subject: CvSubject, paths: readonly string[], used: ReadonlySet<number>): number | null {
  const email = normalizeEmail(subject.email);
  if (email === null) return null;
  const wanted = normalizeText(email);
  const index = paths.findIndex((path, i) => !used.has(i) && contains(fileStem(path), wanted));
  return index >= 0 ? index : null;
}

/** 3. The full name is the file name, words in any order. Two people (or two files) with the same name: no guess. */
function byName(subject: CvSubject, paths: readonly string[], used: ReadonlySet<number>, homonyms: ReadonlySet<string>): number | null {
  const key = nameKey(subject.fullName);
  if (key === '' || homonyms.has(key)) return null;
  const hits = paths.flatMap((path, i) => (!used.has(i) && nameKey(nameFromFileName(baseName(path))) === key ? [i] : []));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

/** Names carried by more than one candidate: their CVs cannot be told apart by name. */
function homonymKeys(subjects: readonly CvSubject[]): ReadonlySet<string> {
  const owners = new Map<string, Set<string>>();
  for (const subject of subjects) {
    const key = nameKey(subject.fullName);
    owners.set(key, new Set([...(owners.get(key) ?? []), subject.candidateRef]));
  }
  return new Set([...owners].filter(([, refs]) => refs.size > 1).map(([key]) => key));
}

/**
 * Pairs the archive's CVs with applications, strongest evidence first and across all rows (a weak guess never takes a
 * file a sure match wants): the file column, then the email in the file name, then the full name in the file name. A CV
 * goes to one application; email and name matches go to the candidate's first application.
 */
export function matchCvs(subjects: readonly CvSubject[], paths: readonly string[]): CvMatches {
  const chosen = new Map<string, number>();
  const used = new Set<number>();
  const homonyms = homonymKeys(subjects);
  const firstOfCandidate = subjects.filter((subject, i) => subjects.findIndex((other) => other.candidateRef === subject.candidateRef) === i);
  const stages: readonly { readonly pool: readonly CvSubject[]; readonly find: (subject: CvSubject) => number | null }[] = [
    { pool: subjects, find: (subject) => byFileCell(subject, paths, used) },
    { pool: firstOfCandidate, find: (subject) => byEmail(subject, paths, used) },
    { pool: firstOfCandidate, find: (subject) => byName(subject, paths, used, homonyms) },
  ];
  const hasCv = new Set<string>();
  for (const { pool, find } of stages) {
    for (const subject of pool) {
      // One CV per application, and a candidate who already has one through another row is not guessed for again.
      if (chosen.has(subject.applicationRef) || (pool !== subjects && hasCv.has(subject.candidateRef))) continue;
      const index = find(subject);
      if (index === null) continue;
      chosen.set(subject.applicationRef, index);
      hasCv.add(subject.candidateRef);
      used.add(index);
    }
  }
  return { byApplication: chosen, unmatched: paths.length - used.size };
}
