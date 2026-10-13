import type { AppContext } from '../app-context.js';
import { DEFAULT_PUBLIC_MAX, DEFAULT_QUALITY_MAX } from '../app-context.js';

/** An ad is long text, but never megabytes. */
export const AD_BODY_LIMIT = 256 * 1024;

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } });

export const publicRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.publicMax ?? DEFAULT_PUBLIC_MAX);
export const qualityRouteConfig = (ctx: AppContext) => perMinute(ctx.rateLimit.qualityMax ?? DEFAULT_QUALITY_MAX);
