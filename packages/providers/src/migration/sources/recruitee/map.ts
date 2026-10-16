import { IMPORT_NOTE_MAX, ORIGIN_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, type StageType } from '@candydati/domain';
import type { BuilderApplication, BuilderCandidate, BuilderJob, BuilderNote } from '../../package-builder.js';
import type { RecruiteeHit, RecruiteeNote, RecruiteeOffer, RecruiteePlacement, RecruiteeStage } from './schemas.js';

/**
 * Recruitee to package mapping. Pure functions that name every field they take: ratings, evaluations, photos and any
 * demographic field are never read, so they cannot reach the package (ADR 0009, decision 3).
 */
const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const UNKNOWN_STAGE = { ref: 'applied', name: 'Applied' } as const;
const STAGES_MAX = 50;

export const isoDate = (value: string | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

const latest = (a: string, b: string): string => (Date.parse(a) >= Date.parse(b) ? a : b);
const trimmed = (value: string | null | undefined): string | undefined => {
  const clean = value?.trim();
  return clean ? clean : undefined;
};

/** A candidate whose Recruitee retention is already over is left out: a migration must not bring back erased data. */
export const isRetentionOver = (hit: RecruiteeHit, now: Date): boolean => {
  const expires = isoDate(hit.gdpr_expires_at);
  return expires !== undefined && Date.parse(expires) <= now.getTime();
};

export const isDeleted = (hit: RecruiteeHit): boolean => hit.deleted === true || trimmed(hit.deleted_at) !== undefined || trimmed(hit.soft_deleted_at) !== undefined;

export const candidateRef = (hit: Pick<RecruiteeHit, 'id'>): string => `candidate-${hit.id}`;
export const stageRefOf = (stage: { id: string } | null | undefined): string => (stage ? `stage-${stage.id}` : UNKNOWN_STAGE.ref);
export const jobRefOf = (offerId: string): string => `offer-${offerId}`;

const linkedinOf = (links: readonly string[]): string | undefined =>
  links.map((link) => link.trim()).find((link) => /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(link) && link.length <= 300);

/**
 * Consent only with a clear given date (`gdpr_consent_given_at`, ASSUMED); Recruitee documents an expiry date and an
 * "ever given" flag but no date of consent. Without a date the person goes through the reconfirmation flow.
 */
function consentOf(hit: RecruiteeHit): BuilderCandidate['consent'] {
  const givenAt = isoDate(hit.gdpr_consent_given_at);
  if (givenAt === undefined) return undefined;
  const expiresAt = isoDate(hit.gdpr_expires_at);
  return { givenAt, ...(expiresAt !== undefined && Date.parse(expiresAt) >= Date.parse(givenAt) ? { expiresAt } : {}) };
}

export function mapCandidate(hit: RecruiteeHit, links: readonly string[], fallbackDate: string): BuilderCandidate {
  const [first = '', ...rest] = (hit.name ?? '').trim().split(/\s+/);
  const email = (hit.emails ?? []).map((e) => e.trim()).find((e) => EMAIL.test(e) && e.length <= 254);
  const phone = (hit.phones ?? []).map((p) => p.trim()).find((p) => PHONE.test(p));
  const linkedinUrl = linkedinOf(links);
  const tags = [...new Set((hit.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag !== '' && tag.length <= TAG_MAX))].slice(0, TAGS_PER_CANDIDATE_MAX);
  const consent = consentOf(hit);
  return {
    ref: candidateRef(hit),
    firstName: first || '-',
    lastName: rest.join(' ') || '-',
    ...(email === undefined ? {} : { email }),
    ...(phone === undefined ? {} : { phone }),
    ...(linkedinUrl === undefined ? {} : { linkedinUrl }),
    tags,
    createdAt: isoDate(hit.created_at) ?? fallbackDate,
    ...(consent === undefined ? {} : { consent }),
  };
}

export function stageTypeOf(stage: Pick<RecruiteeStage, 'name' | 'category'>): StageType | undefined {
  const label = `${stage.category ?? ''} ${stage.name ?? ''}`.toLowerCase();
  if (/phone|screen/.test(label)) return 'screening_call';
  if (/final/.test(label)) return 'final_interview';
  if (/technical|assessment|task/.test(label)) return 'technical_interview';
  if (/\boffer\b/.test(label)) return 'offer';
  return undefined;
}

const isHired = (stage: Pick<RecruiteeStage, 'name' | 'category'> | null | undefined): boolean =>
  stage !== null && stage !== undefined && (stage.category?.trim().toLowerCase() === 'hired' || stage.name?.trim().toLowerCase() === 'hired');

export interface MappedApplication {
  readonly application: BuilderApplication;
  readonly offerId: string;
}

/** One placement to one application; null when it names no offer. Disqualified: not selected; hired stage: hired. */
export function mapPlacement(hit: RecruiteeHit, placement: RecruiteePlacement, candidateCreatedAt: string): MappedApplication | null {
  const offer = placement.offer;
  if (!offer) return null;
  const createdAt = isoDate(placement.created_at) ?? candidateCreatedAt;
  const origin = trimmed(hit.source)?.slice(0, ORIGIN_MAX);
  const base: BuilderApplication = {
    ref: `placement-${placement.id ?? `${hit.id}-${offer.id}`}`,
    candidateRef: candidateRef(hit),
    jobRef: jobRefOf(offer.id),
    stageRef: stageRefOf(placement.stage),
    createdAt,
    ...(origin === undefined ? {} : { origin }),
  };
  const closing = (at: string | undefined): string => latest(at ?? createdAt, createdAt);
  if (placement.disqualified === true || trimmed(placement.disqualified_at) !== undefined) {
    return { offerId: offer.id, application: { ...base, outcome: 'not_selected', closedAt: closing(isoDate(placement.disqualified_at) ?? isoDate(hit.updated_at)) } };
  }
  if (isHired(placement.stage)) {
    return { offerId: offer.id, application: { ...base, outcome: 'hired', closedAt: closing(isoDate(placement.updated_at) ?? isoDate(hit.updated_at)) } };
  }
  return { offerId: offer.id, application: base };
}

export function mapNote(note: RecruiteeNote, candidateRefValue: string, fallbackDate: string): BuilderNote | null {
  const body = [note.body, note.text, note.message, note.content].map(trimmed).find((v) => v !== undefined);
  if (body === undefined) return null;
  const authorName = [note.admin?.name, note.author?.name, note.admin_name].map(trimmed).find((v) => v !== undefined);
  return {
    candidateRef: candidateRefValue,
    ...(authorName === undefined ? {} : { authorName: authorName.slice(0, 120) }),
    body: body.slice(0, IMPORT_NOTE_MAX),
    createdAt: isoDate(note.created_at) ?? fallbackDate,
  };
}

type JobStatus = BuilderJob['status'];
const statusOf = (status: string | null | undefined): JobStatus => {
  const value = status?.trim().toLowerCase();
  if (value === 'draft') return 'draft';
  return value === 'closed' || value === 'archived' ? 'closed' : 'open';
};

interface StageDraft {
  readonly name: string;
  readonly type?: StageType;
}
type Stages = ReadonlyMap<string, StageDraft>;
interface JobDraft {
  readonly title: string;
  readonly status: JobStatus;
  readonly createdAt: string;
  readonly closedAt: string | undefined;
  readonly stages: Stages;
}

type StageInput = { id: string; name?: string | null | undefined; category?: string | null | undefined } | null | undefined;

function withStage(stages: Stages, stage: StageInput): Stages {
  const ref = stageRefOf(stage);
  if (stages.has(ref)) return stages;
  const type = stage ? stageTypeOf(stage) : undefined;
  return new Map([...stages, [ref, { name: (trimmed(stage?.name) ?? UNKNOWN_STAGE.name).slice(0, 80), ...(type === undefined ? {} : { type }) }]]);
}

function draftOf(offer: RecruiteeOffer, now: Date): JobDraft {
  const createdAt = isoDate(offer.created_at) ?? now.toISOString();
  const closed = isoDate(offer.closed_at) ?? isoDate(offer.close_at);
  const status = statusOf(offer.status);
  return {
    title: trimmed(offer.title)?.slice(0, 120) ?? `Offer ${offer.id}`,
    status,
    createdAt,
    closedAt: status === 'closed' && closed !== undefined && Date.parse(closed) >= Date.parse(createdAt) ? closed : undefined,
    stages: (offer.pipeline_template?.stages ?? []).reduce<Stages>(withStage, new Map()),
  };
}

export interface JobCollector {
  notePlacement(placement: RecruiteePlacement, candidateCreatedAt: string): void;
  jobs(): readonly BuilderJob[];
}

/** Jobs from the offers list (stages from its pipeline when present), completed by the offers and stages placements name. */
export function createJobCollector(offers: readonly RecruiteeOffer[], now: Date): JobCollector {
  let drafts: ReadonlyMap<string, JobDraft> = new Map(offers.map((offer) => [offer.id, draftOf(offer, now)]));
  const put = (offerId: string, draft: JobDraft): void => {
    drafts = new Map([...drafts, [offerId, draft]]);
  };
  return {
    notePlacement(placement, candidateCreatedAt) {
      const offer = placement.offer;
      if (!offer) return;
      const known = drafts.get(offer.id);
      const stages = withStage(known?.stages ?? new Map(), placement.stage);
      if (known) put(offer.id, { ...known, stages });
      else put(offer.id, { title: trimmed(offer.title)?.slice(0, 120) ?? `Offer ${offer.id}`, status: statusOf(offer.status), createdAt: candidateCreatedAt, closedAt: undefined, stages });
    },
    jobs: () =>
      [...drafts].map(([offerId, draft]) => ({
        ref: jobRefOf(offerId),
        title: draft.title,
        status: draft.status,
        createdAt: draft.createdAt,
        ...(draft.closedAt === undefined ? {} : { closedAt: draft.closedAt }),
        stages: [...draft.stages].slice(0, STAGES_MAX).map(([ref, stage]) => ({ ref, name: stage.name, ...(stage.type === undefined ? {} : { type: stage.type }) })),
      })),
  };
}
