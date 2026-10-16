import type { FileStorage } from '@candydati/core';
import { migrationFetchFileKey, migrationPackageItemSchemas, type MigrationPackage } from '@candydati/domain';
import type { z } from 'zod';
import type { DownloadStore } from '../http/index.js';

type Schemas = typeof migrationPackageItemSchemas;
type Kind = keyof Schemas;
type Input<K extends Kind> = z.input<Schemas[K]>;
type Output<K extends Kind> = z.output<Schemas[K]>;

/**
 * What a connector may set, and nothing else: the package item types, which have no field for scores, ratings,
 * demographic data, photos or birth dates (ADR 0009, decision 3). A file is added with `addFile`, never by path.
 */
export type BuilderUser = Input<'user'>;
export type BuilderJob = Input<'job'>;
export type BuilderCandidate = Input<'candidate'>;
export type BuilderApplication = Omit<Input<'application'>, 'files'>;
export type BuilderNote = Input<'note'>;
export type BuilderMessage = Input<'message'>;
export interface BuilderFile {
  readonly kind: 'cv' | 'cover_letter' | 'other';
  readonly fileName: string;
}

export type PackageBuilderErrorCode = 'invalid_item' | 'duplicate_ref' | 'file_too_large' | 'file_not_stored' | 'dangling_ref' | 'part_too_large';

/** A refused item or file. Carries kinds, refs and field paths, never values. */
export class PackageBuilderError extends Error {
  constructor(
    readonly code: PackageBuilderErrorCode,
    readonly kind: string,
    readonly ref: string | null,
    readonly paths: readonly string[] = [],
  ) {
    super(`${code}: ${kind}${ref === null ? '' : ` ${ref}`}${paths.length > 0 ? ` (${paths.join(', ')})` : ''}`);
    this.name = 'PackageBuilderError';
  }
}

/** The interface a connector writes to. */
export interface PackageBuilder {
  addUser(user: BuilderUser): void;
  addJob(job: BuilderJob): void;
  addCandidate(candidate: BuilderCandidate): void;
  addApplication(application: BuilderApplication): void;
  addNote(note: BuilderNote): void;
  addMessage(message: BuilderMessage): void;
  /**
   * Streams one file of an application to storage now (vendor URLs expire within seconds): `write` gets a store to pass
   * to `reader.download`. Returns the file's path in the package.
   */
  addFile(applicationRef: string, file: BuilderFile, write: (store: DownloadStore) => Promise<unknown>): Promise<string>;
}

export interface StoredPackageFile {
  /** Temporary storage key. */
  readonly key: string;
  readonly bytes: number;
}

/** Everything collected, ready to be split into packages. Items are in the package's own (parsed) shape. */
export interface CollectedPackage {
  readonly source: MigrationPackage['source'];
  readonly users: readonly Output<'user'>[];
  readonly jobs: readonly Output<'job'>[];
  readonly candidates: readonly Output<'candidate'>[];
  readonly applications: readonly Output<'application'>[];
  readonly notes: readonly Output<'note'>[];
  readonly messages: readonly Output<'message'>[];
  readonly files: ReadonlyMap<string, StoredPackageFile>;
}

export interface PackageBuilderOptions {
  readonly files: Pick<FileStorage, 'putStream' | 'delete'>;
  /** `organizations/{org}/migrations/{batchId}/`. */
  readonly filePrefix: string;
  readonly source: MigrationPackage['source'];
  /** Called before a temporary slot is written, so a crashed fetch can still be cleaned up. */
  readonly reserveFiles: (upTo: number) => Promise<void>;
  readonly maxFileBytes?: number | undefined;
}

export interface CollectingPackageBuilder extends PackageBuilder {
  collected(): CollectedPackage;
  /** Deletes every temporary file. */
  discard(): Promise<void>;
}

export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;
const FILE_NAME_MAX = 120;
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f"'`<>:*?|;&$%{}[\]^~#\\/‪-‮⁦-⁩]/g;

/** A file name safe as the last segment of a package path: no path, control or bidi characters. */
export function packageFileName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? '';
  const clean = last.normalize('NFC').replace(UNSAFE_NAME, '').replace(/\s+/g, ' ').replace(/^[.\s-]+|[.\s]+$/g, '').trim();
  return Array.from(clean).slice(0, FILE_NAME_MAX).join('').trim() || 'file';
}

/** Only the fields the package knows, at the top level: a vendor record spread into an item loses everything else. */
function known<K extends Kind>(kind: K, value: object): Record<string, unknown> {
  const shape = migrationPackageItemSchemas[kind].shape as Record<string, unknown>;
  return Object.fromEntries(Object.entries(value).filter(([key]) => Object.hasOwn(shape, key)));
}

function parseItem<K extends Kind>(kind: K, value: object): Output<K> {
  const parsed = migrationPackageItemSchemas[kind].safeParse(known(kind, value));
  if (parsed.success) return parsed.data as Output<K>;
  const ref = 'ref' in value && typeof value.ref === 'string' ? value.ref : null;
  throw new PackageBuilderError('invalid_item', kind, ref, [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]);
}

async function* capped(source: AsyncIterable<Uint8Array>, max: number): AsyncIterable<Uint8Array> {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > max) throw new PackageBuilderError('file_too_large', 'file', null);
    yield chunk;
  }
}

interface FileEntry extends StoredPackageFile {
  readonly applicationRef: string;
  readonly path: string;
  readonly kind: BuilderFile['kind'];
  readonly fileName: string;
}

interface FileSlots {
  store(applicationRef: string, file: BuilderFile, write: (s: DownloadStore) => Promise<unknown>): Promise<string>;
  entries(): readonly FileEntry[];
  discard(): Promise<void>;
}

/** Temporary file slots of one run: reserved before use, written by streaming, freed when a download fails. */
function fileSlots(options: PackageBuilderOptions): FileSlots {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  let entries: readonly FileEntry[] = [];
  let used: readonly string[] = [];
  return {
    async store(applicationRef, file, write) {
      const slot = used.length;
      const key = migrationFetchFileKey(options.filePrefix, slot);
      used = [...used, key];
      await options.reserveFiles(slot + 1);
      let bytes: number | null = null;
      try {
        await write(async (source, mediaType) => {
          bytes = await options.files.putStream(key, capped(source, maxFileBytes), mediaType ?? 'application/octet-stream');
          return bytes;
        });
      } catch (error) {
        await options.files.delete(key);
        throw error;
      }
      if (bytes === null) throw new PackageBuilderError('file_not_stored', 'file', applicationRef);
      const fileName = packageFileName(file.fileName);
      const path = `files/${slot}/${fileName}`;
      entries = [...entries, { applicationRef, path, kind: file.kind, fileName, key, bytes }];
      return path;
    },
    entries: () => entries,
    async discard() {
      for (const key of used) await options.files.delete(key);
    },
  };
}

type RefKind = 'user' | 'job' | 'candidate' | 'application';

/** Collects one connector run. Refs stay as the connector gives them (the vendor's ids), unique per kind. */
export function createPackageBuilder(options: PackageBuilderOptions): CollectingPackageBuilder {
  let byRef: Readonly<Record<RefKind, ReadonlyMap<string, { ref: string }>>> = { user: new Map(), job: new Map(), candidate: new Map(), application: new Map() };
  let notes: readonly Output<'note'>[] = [];
  let messages: readonly Output<'message'>[] = [];
  const slots = fileSlots(options);
  const addRef = (kind: RefKind, value: object): void => {
    const parsed = parseItem(kind, value) as { ref: string };
    if (byRef[kind].has(parsed.ref)) throw new PackageBuilderError('duplicate_ref', kind, parsed.ref);
    byRef = { ...byRef, [kind]: new Map([...byRef[kind], [parsed.ref, parsed]]) };
  };
  const all = <K extends RefKind>(kind: K): Output<K>[] => [...byRef[kind].values()] as Output<K>[];
  return {
    addUser: (user) => addRef('user', user),
    addJob: (job) => addRef('job', job),
    addCandidate: (candidate) => addRef('candidate', candidate),
    addApplication: (application) => addRef('application', { ...application, files: [] }),
    addNote: (note) => {
      notes = [...notes, parseItem('note', note)];
    },
    addMessage: (message) => {
      messages = [...messages, parseItem('message', message)];
    },
    addFile: slots.store,
    collected: () => {
      const files = slots.entries();
      const filesOf = (ref: string) => files.filter((f) => f.applicationRef === ref).map(({ path, kind, fileName }) => ({ path, kind, fileName }));
      return {
        source: options.source,
        users: all('user'),
        jobs: all('job'),
        candidates: all('candidate'),
        applications: all('application').map((application) => ({ ...application, files: filesOf(application.ref) })),
        notes,
        messages,
        files: new Map(files.map((f) => [f.path, { key: f.key, bytes: f.bytes }])),
      };
    },
    discard: slots.discard,
  };
}
