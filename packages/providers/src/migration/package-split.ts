import type { MigrationPartCounts } from '@candydati/core';
import { MIGRATION_PACKAGE_FORMAT, type MigrationPackage } from '@candydati/domain';
import { PackageBuilderError, type CollectedPackage } from './package-builder.js';

/** The limits one package must respect (MIGRATION_LIMITS; tests pass smaller ones). */
export type PartLimits = Readonly<Record<'users' | 'jobs' | 'candidates' | 'applications' | 'notes' | 'messages' | 'files' | 'totalBytes' | 'manifestBytes', number>>;

export interface PackagePart {
  readonly manifest: MigrationPackage;
  /** The files the manifest references, with their temporary keys. */
  readonly files: readonly { readonly path: string; readonly key: string; readonly bytes: number }[];
  readonly counts: MigrationPartCounts;
}

/** Room left for the ZIP structure and the JSON punctuation the item estimate does not count. */
const MANIFEST_OVERHEAD = 64 * 1024;

type Note = CollectedPackage['notes'][number];
type Message = CollectedPackage['messages'][number];

/** A unit that goes into one part whole: a job with everything that hangs from it, or one person on their own. */
interface Cluster {
  readonly kind: 'job' | 'candidate';
  readonly ref: string;
  readonly jobs: readonly string[];
  readonly applications: readonly string[];
  readonly candidates: readonly string[];
  readonly users: readonly string[];
  readonly notes: readonly Note[];
  readonly messages: readonly Message[];
  readonly files: readonly string[];
  /** JSON bytes of what the cluster alone adds, people and authors excluded (counted when new to a part). */
  readonly bytes: number;
  readonly fileBytes: number;
}

interface Part {
  jobs: Set<string>;
  applications: Set<string>;
  candidates: Set<string>;
  users: Set<string>;
  notes: Note[];
  messages: Message[];
  files: Set<string>;
  manifestBytes: number;
  fileBytes: number;
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
const emptyPart = (): Part => ({ jobs: new Set(), applications: new Set(), candidates: new Set(), users: new Set(), notes: [], messages: [], files: new Set(), manifestBytes: MANIFEST_OVERHEAD, fileBytes: 0 });
const dangling = (kind: string, ref: string | null): never => {
  throw new PackageBuilderError('dangling_ref', kind, ref);
};

/** Every reference points at something the connector added: a part can only be consistent if the whole is. */
function checkReferences(input: CollectedPackage): void {
  const candidates = new Set(input.candidates.map((c) => c.ref));
  const jobs = new Map(input.jobs.map((j) => [j.ref, new Set(j.stages.map((s) => s.ref))]));
  const applications = new Set(input.applications.map((a) => a.ref));
  const users = new Set(input.users.map((u) => u.ref));
  for (const a of input.applications) {
    if (!candidates.has(a.candidateRef) || !jobs.get(a.jobRef)?.has(a.stageRef)) dangling('application', a.ref);
  }
  for (const n of input.notes) {
    const bad = !candidates.has(n.candidateRef) || (n.applicationRef !== undefined && !applications.has(n.applicationRef)) || (n.authorRef !== undefined && !users.has(n.authorRef));
    if (bad) dangling('note', null);
  }
  for (const m of input.messages) if (!applications.has(m.applicationRef)) dangling('message', null);
}

/** One cluster per job, in the connector's order, then one per person whose notes or record are not under a job. */
function clustersOf(input: CollectedPackage, sizeOf: ReadonlyMap<string, number>): readonly Cluster[] {
  const appsByJob = groupBy(input.applications, (a) => a.jobRef);
  const notesByApp = groupBy(input.notes.filter((n) => n.applicationRef !== undefined), (n) => n.applicationRef ?? '');
  const messagesByApp = groupBy(input.messages, (m) => m.applicationRef);
  const authors = (notes: readonly Note[]) => [...new Set(notes.flatMap((n) => (n.authorRef === undefined ? [] : [n.authorRef])))];
  const jobClusters = input.jobs.map((job): Cluster => {
    const apps = appsByJob.get(job.ref) ?? [];
    const notes = apps.flatMap((a) => notesByApp.get(a.ref) ?? []);
    const messages = apps.flatMap((a) => messagesByApp.get(a.ref) ?? []);
    const files = apps.flatMap((a) => a.files.map((f) => f.path));
    const bytes = jsonBytes(job) + apps.reduce((sum, a) => sum + (sizeOf.get(`a:${a.ref}`) ?? 0), 0) + jsonBytes(notes) + jsonBytes(messages);
    const fileBytes = files.reduce((sum, path) => sum + (input.files.get(path)?.bytes ?? 0), 0);
    return { kind: 'job', ref: job.ref, jobs: [job.ref], applications: apps.map((a) => a.ref), candidates: [...new Set(apps.map((a) => a.candidateRef))], users: authors(notes), notes, messages, files, bytes, fileBytes };
  });
  const personNotes = groupBy(input.notes.filter((n) => n.applicationRef === undefined), (n) => n.candidateRef);
  const applied = new Set(input.applications.map((a) => a.candidateRef));
  const people = input.candidates.filter((c) => personNotes.has(c.ref) || !applied.has(c.ref));
  const personClusters = people.map((person): Cluster => {
    const notes = personNotes.get(person.ref) ?? [];
    return { kind: 'candidate', ref: person.ref, jobs: [], applications: [], candidates: [person.ref], users: authors(notes), notes, messages: [], files: [], bytes: jsonBytes(notes), fileBytes: 0 };
  });
  return [...jobClusters, ...personClusters];
}

/** The part with the cluster added, or null when a limit would be exceeded. */
function fits(part: Part, cluster: Cluster, limits: PartLimits, sizeOf: ReadonlyMap<string, number>): boolean {
  const newPeople = cluster.candidates.filter((ref) => !part.candidates.has(ref));
  const newUsers = cluster.users.filter((ref) => !part.users.has(ref));
  const manifest = part.manifestBytes + cluster.bytes + newPeople.reduce((s, r) => s + (sizeOf.get(`c:${r}`) ?? 0), 0) + newUsers.reduce((s, r) => s + (sizeOf.get(`u:${r}`) ?? 0), 0);
  return (
    part.jobs.size + cluster.jobs.length <= limits.jobs &&
    part.applications.size + cluster.applications.length <= limits.applications &&
    part.candidates.size + newPeople.length <= limits.candidates &&
    part.users.size + newUsers.length <= limits.users &&
    part.notes.length + cluster.notes.length <= limits.notes &&
    part.messages.length + cluster.messages.length <= limits.messages &&
    part.files.size + cluster.files.length <= limits.files &&
    manifest <= limits.manifestBytes &&
    manifest + part.fileBytes + cluster.fileBytes <= limits.totalBytes
  );
}

function add(part: Part, cluster: Cluster, sizeOf: ReadonlyMap<string, number>): void {
  for (const ref of cluster.candidates) if (!part.candidates.has(ref)) part.manifestBytes += sizeOf.get(`c:${ref}`) ?? 0;
  for (const ref of cluster.users) if (!part.users.has(ref)) part.manifestBytes += sizeOf.get(`u:${ref}`) ?? 0;
  part.manifestBytes += cluster.bytes;
  part.fileBytes += cluster.fileBytes;
  for (const ref of cluster.jobs) part.jobs.add(ref);
  for (const ref of cluster.applications) part.applications.add(ref);
  for (const ref of cluster.candidates) part.candidates.add(ref);
  for (const ref of cluster.users) part.users.add(ref);
  for (const path of cluster.files) part.files.add(path);
  part.notes.push(...cluster.notes);
  part.messages.push(...cluster.messages);
}

/** Greedy, in order: the current part if it fits, else a new one. A person goes where they already are when possible. */
function pack(clusters: readonly Cluster[], limits: PartLimits, sizeOf: ReadonlyMap<string, number>): readonly Part[] {
  const parts: Part[] = [emptyPart()];
  for (const cluster of clusters) {
    const preferred = cluster.kind === 'candidate' ? parts.find((p) => p.candidates.has(cluster.ref) && fits(p, cluster, limits, sizeOf)) : undefined;
    const last = parts.at(-1) ?? emptyPart();
    const target = preferred ?? (fits(last, cluster, limits, sizeOf) ? last : emptyPart());
    if (!fits(target, cluster, limits, sizeOf)) throw new PackageBuilderError('part_too_large', cluster.kind, cluster.ref);
    if (!parts.includes(target)) parts.push(target);
    add(target, cluster, sizeOf);
  }
  return parts.filter((part) => part.jobs.size + part.candidates.size > 0);
}

function toPackagePart(input: CollectedPackage, part: Part): PackagePart {
  const manifest: MigrationPackage = {
    format: MIGRATION_PACKAGE_FORMAT,
    version: 1,
    source: input.source,
    users: input.users.filter((u) => part.users.has(u.ref)),
    jobs: input.jobs.filter((j) => part.jobs.has(j.ref)),
    candidates: input.candidates.filter((c) => part.candidates.has(c.ref)),
    applications: input.applications.filter((a) => part.applications.has(a.ref)),
    notes: part.notes,
    messages: part.messages,
  };
  const files = [...part.files].map((path) => ({ path, key: input.files.get(path)?.key ?? '', bytes: input.files.get(path)?.bytes ?? 0 }));
  const counts: MigrationPartCounts = {
    jobs: manifest.jobs.length,
    candidates: manifest.candidates.length,
    applications: manifest.applications.length,
    notes: manifest.notes.length,
    messages: manifest.messages.length,
    files: files.length,
    bytes: part.fileBytes,
  };
  return { manifest, files, counts };
}

/**
 * Splits what a connector collected into packages that each respect MIGRATION_LIMITS (ADR 0009: one package is read in
 * memory by one worker). The unit is a job with all its applications, their files, notes and messages: a job is never
 * cut in two, so it is never created twice. A person who applied to jobs in different parts is repeated in each (the
 * commit merges people by email; people without one are created once per part, which the preview flags as `no_email`).
 * People with no application, and notes about a person rather than an application, go to a part that already holds
 * them. Deterministic: the connector's order is kept.
 * @throws PackageBuilderError `part_too_large` when one job alone exceeds a package, `dangling_ref` on a broken reference.
 */
export function splitPackage(input: CollectedPackage, limits: PartLimits): readonly PackagePart[] {
  checkReferences(input);
  const sizeOf = new Map<string, number>([
    ...input.candidates.map((c) => [`c:${c.ref}`, jsonBytes(c)] as const),
    ...input.users.map((u) => [`u:${u.ref}`, jsonBytes(u)] as const),
    ...input.applications.map((a) => [`a:${a.ref}`, jsonBytes(a)] as const),
  ]);
  const parts = pack(clustersOf(input, sizeOf), limits, sizeOf);
  return (parts.length === 0 ? [emptyPart()] : parts).map((part) => toPackagePart(input, part));
}
