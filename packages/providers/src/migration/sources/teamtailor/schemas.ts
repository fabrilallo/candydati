import { z } from 'zod';

/**
 * Zod schemas of the Teamtailor JSON:API pages the connector reads. Source: https://docs.teamtailor.com/ and the
 * reference mirror https://teamtailor-docs.netlify.app/. Tolerant on purpose: only what the mapping needs is required,
 * nulls are accepted everywhere, and unknown attributes are ignored (and never copied anywhere).
 */
const id = z.union([z.string().min(1), z.number()]).transform(String);
const text = z.string().nullish();
const flag = z.boolean().nullish();

/** A to-one relationship's linkage (`data: {id, type}`), only present when the relation is included. Other shapes are ignored. */
const relationships = z.record(z.string(), z.object({ data: z.unknown().optional() }).passthrough()).optional();

const links = z.object({ next: z.string().nullish() }).optional();

const resource = <A extends z.ZodType>(attributes: A) => z.object({ id, attributes, relationships });
const listOf = <A extends z.ZodType>(attributes: A) => z.object({ data: z.array(resource(attributes)), links });

const userAttributes = z.object({ name: text, email: text });
const jobAttributes = z.object({ title: text, status: text, 'created-at': text });
const stageAttributes = z.object({ name: text, 'stage-type': text, 'row-order': z.number().nullish() });
const candidateAttributes = z.object({
  'first-name': text,
  'last-name': text,
  email: text,
  phone: text,
  'linkedin-url': text,
  tags: z.array(z.string()).nullish(),
  'created-at': text,
  resume: text,
  'original-resume': text,
});
const applicationAttributes = z.object({
  'created-at': text,
  'rejected-at': text,
  'changed-stage-at': text,
  'cover-letter': text,
  'referring-site': text,
  sourced: flag,
});
const uploadAttributes = z.object({ url: text, 'file-name': text, internal: flag });
const answerAttributes = z.object({ text, boolean: flag, range: z.number().nullish() });
const questionAttributes = z.object({ title: text });
const rejectReasonAttributes = z.object({ 'rejected-by-company': flag });
const noteAttributes = z.object({ note: text, 'user-id': id.nullish(), 'candidate-id': id.nullish(), 'private-note': flag, 'created-at': text });

/**
 * The notes list is documented with an unusual shape (`{ "notes": [ { "data": {...} } ] }`): both it and the usual
 * `{ "data": [...] }` are accepted and normalised to the usual one.
 */
const notesPage = z
  .union([listOf(noteAttributes), z.object({ notes: z.array(z.object({ data: resource(noteAttributes) })), links })])
  .transform((page) => ('notes' in page ? { data: page.notes.map((entry) => entry.data), links: page.links } : page));

export const teamtailorPages = {
  users: listOf(userAttributes),
  jobs: listOf(jobAttributes),
  stages: listOf(stageAttributes),
  candidates: listOf(candidateAttributes),
  applications: listOf(applicationAttributes),
  uploads: listOf(uploadAttributes),
  answers: listOf(answerAttributes),
  questions: listOf(questionAttributes),
  rejectReasons: listOf(rejectReasonAttributes),
  notes: notesPage,
} as const;

type Pages = typeof teamtailorPages;
export type TeamtailorPageName = keyof Pages;
export type TeamtailorResource<K extends TeamtailorPageName> = z.output<Pages[K]>['data'][number];

/** The id a to-one relationship points at, or undefined when the page did not carry the linkage. */
export function linkedId(resourceValue: { readonly relationships?: Record<string, { data?: unknown }> | undefined }, name: string): string | undefined {
  const data = resourceValue.relationships?.[name]?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !('id' in data)) return undefined;
  const value = (data as { id: unknown }).id;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}
