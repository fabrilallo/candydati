import { z } from 'zod';

/**
 * How far an organization is set up to publish transparent ads and answer every applicant (no personal data). Email is
 * an instance setting and comes from the instance email settings, not from here.
 */
export const setupProgressSchema = z.object({
  /** An active privacy notice: without it nothing can be published. */
  privacyNotice: z.boolean(),
  /** The careers page was published at least once. */
  careersPage: z.boolean(),
  /** At least one job exists, whatever its status. */
  jobCreated: z.boolean(),
  /** At least one job was published (still published or closed since). */
  jobPublished: z.boolean(),
  /** Someone besides the creator is a member. */
  team: z.boolean(),
});
export type SetupProgressDto = z.infer<typeof setupProgressSchema>;
