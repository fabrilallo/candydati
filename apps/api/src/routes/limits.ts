import type { AppContext } from '../app-context.js';
import { DEFAULT_APPLY_MAX, DEFAULT_APPLY_WINDOW_MINUTES, DEFAULT_INBOUND_MAX, DEFAULT_PUBLIC_MAX, DEFAULT_QUALITY_MAX } from '../app-context.js';

/** An ad is long text, but never megabytes. */
export const AD_BODY_LIMIT = 256 * 1024;

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } });

export const publicRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.publicMax ?? DEFAULT_PUBLIC_MAX);
export const qualityRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.qualityMax ?? DEFAULT_QUALITY_MAX);

/** A public application stores a file and a candidate: a handful per client is plenty. */
export const applyRouteConfig = (ctx: AppContext) => ({
  rateLimit: {
    max: ctx.rateLimit.applyMax ?? DEFAULT_APPLY_MAX,
    timeWindow: `${ctx.rateLimit.applyWindowMinutes ?? DEFAULT_APPLY_WINDOW_MINUTES} minutes`,
  },
});

/** Provider webhooks: signed, server-to-server, and their own budget apart from the public pages. */
export const inboundRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.inboundMax ?? DEFAULT_INBOUND_MAX);

export const DEFAULT_IMPORT_MAX = 10;
export const DEFAULT_CONSENT_MAX = 30;

/** An upload can be 200 MB read into memory and parsed: a handful per minute and client is plenty. */
export const importUploadRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.importMax ?? DEFAULT_IMPORT_MAX);

/** The public reconfirmation page: tokens are unguessable, but guessing must still be slow. */
export const consentRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.consentMax ?? DEFAULT_CONSENT_MAX);

export const DEFAULT_FEEDBACK_MAX = 30;

/** The public interview feedback page: the token is the only credential, so guessing must be slow. */
export const feedbackRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.feedbackMax ?? DEFAULT_FEEDBACK_MAX);
