import { z } from 'zod';

/**
 * Tolerant response schemas for the Recruitee API. Every field is optional and unknown fields are dropped (the zod
 * default), so a vendor change cannot fail a whole page and ratings, photos and evaluations never get past this file:
 * they are not named here. What each schema is based on is listed in the README (verified vs assumed).
 */
const id = z.union([z.number(), z.string().min(1)]).transform(String);
const text = z.string().nullish();
const flag = z.boolean().nullish();

const stageSchema = z.object({ id, name: text, category: text, position: z.number().nullish() });
export type RecruiteeStage = z.infer<typeof stageSchema>;

const offerRefSchema = z.object({ id, title: text, status: text, kind: text, slug: text });
export type RecruiteeOfferRef = z.infer<typeof offerRefSchema>;

/** VERIFIED (searchnewcandidates): a placement carries id, offer, stage and the disqualification fields. */
const placementSchema = z.object({
  id: id.nullish(),
  offer: offerRefSchema.nullish(),
  stage: z.object({ id, name: text, category: text }).nullish(),
  disqualified: flag,
  disqualified_at: text,
  created_at: text,
  updated_at: text,
});
export type RecruiteePlacement = z.infer<typeof placementSchema>;

const tagSchema = z.union([z.string(), z.object({ name: z.string() })]).transform((tag) => (typeof tag === 'string' ? tag : tag.name));

/** VERIFIED (searchnewcandidates) except `gdpr_consent_given_at`, which is ASSUMED and optional. */
export const hitSchema = z.object({
  id,
  name: text,
  emails: z.array(z.string()).nullish(),
  phones: z.array(z.string()).nullish(),
  source: text,
  tags: z.array(tagSchema).nullish(),
  created_at: text,
  updated_at: text,
  deleted: flag,
  deleted_at: text,
  soft_deleted_at: text,
  gdpr_expires_at: text,
  gdpr_consent_ever_given: flag,
  gdpr_consent_given_at: text,
  placements: z.array(placementSchema).nullish(),
});
export type RecruiteeHit = z.infer<typeof hitSchema>;

/** Hits are parsed one by one by the client, so one odd record does not fail the page. */
export const searchPageSchema = z.object({ hits: z.array(z.unknown()), total: z.number().nullish() });

/** ASSUMED wrapper (`offers`); fields from the /offers/:id reference (VERIFIED for that endpoint). */
const offerSchema = z.object({
  id,
  title: text,
  status: text,
  kind: text,
  created_at: text,
  closed_at: text,
  close_at: text,
  pipeline_template: z.object({ stages: z.array(stageSchema).nullish() }).nullish(),
});
export type RecruiteeOffer = z.infer<typeof offerSchema>;
export const offersPageSchema = z.object({ offers: z.array(z.unknown()).nullish() });
export const offerDetailSchema = z.object({ offer: offerSchema.nullish() });
export { offerSchema };

const attachmentSchema = z.object({ url: text, file_url: text, name: text, file_name: text, filename: text });

/** VERIFIED (candidates/:id): cv_original_url, cv_url, cover_letter, links. `attachments` as a list is ASSUMED. */
export const candidateDetailSchema = z.object({
  candidate: z
    .object({
      cv_original_url: text,
      cv_url: text,
      cover_letter: text,
      links: z.array(z.string()).nullish(),
      attachments: z.array(attachmentSchema).nullish(),
      attachments_count: z.number().nullish(),
    })
    .nullish(),
});
export type RecruiteeAttachment = z.infer<typeof attachmentSchema>;

const noteSchema = z.object({
  body: text,
  text: text,
  message: text,
  content: text,
  created_at: text,
  admin: z.object({ name: text }).nullish(),
  author: z.object({ name: text }).nullish(),
  admin_name: text,
  visibility: text,
});
export type RecruiteeNote = z.infer<typeof noteSchema>;

/** ASSUMED: `GET /candidates/:id/notes`, either `{ notes: [...] }` or a bare list. */
export const notesSchema = z.union([z.object({ notes: z.array(z.unknown()) }).transform((v) => v.notes), z.array(z.unknown())]);
export { noteSchema };
