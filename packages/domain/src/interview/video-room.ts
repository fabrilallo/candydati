import { z } from 'zod';
import { INTERVIEW_LOCATION_MAX } from './interview.js';

/** The WHATWG URL parser, present in browsers and Node; declared because this package loads no DOM or Node types. */
declare const URL: new (input: string) => { readonly hostname: string; readonly username: string; readonly password: string };

/**
 * A person's own video room (a Google Meet, Zoom or Teams link they reuse): saved once, it becomes the link of the video
 * interviews they run, so a booked interview always says where to meet. It is sent to candidates, so only an https
 * address with a domain name and no credentials is accepted.
 */

export const VIDEO_PROVIDERS = ['meet', 'zoom', 'teams', 'other'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export const videoRoomUrlSchema = z
  .string()
  .trim()
  .max(INTERVIEW_LOCATION_MAX)
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }))
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.username === '' && url.password === '';
    } catch {
      return false;
    }
  }, 'credentials_in_url');

export const videoRoomInputSchema = z.object({ url: videoRoomUrlSchema }).strict();
export type VideoRoomInput = z.infer<typeof videoRoomInputSchema>;

const PROVIDER_HOSTS: readonly (readonly [VideoProvider, RegExp])[] = [
  ['meet', /(^|\.)meet\.google\.com$/],
  ['zoom', /(^|\.)zoom\.(us|com)$/],
  ['teams', /(^|\.)teams\.(microsoft|live)\.com$/],
];

/** Pure: which service a room address belongs to ("other" for any other one, or one that is not an address). */
export function videoProviderOf(url: string): VideoProvider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROVIDER_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? 'other';
  } catch {
    return 'other';
  }
}
