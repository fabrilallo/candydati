/**
 * External videos (YouTube, Vimeo). The page stores the provider and the video id, never a URL, and builds the embed
 * address itself: YouTube through youtube-nocookie.com, Vimeo with `dnt=1`. The embed is loaded only when the visitor
 * clicks (a facade), so no request reaches the provider before that.
 */
export const EXTERNAL_VIDEO_PROVIDERS = ['youtube', 'vimeo'] as const;
export type ExternalVideoProvider = (typeof EXTERNAL_VIDEO_PROVIDERS)[number];

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const VIMEO_ID = /^[0-9]{1,12}$/;

export interface ExternalVideo {
  readonly provider: ExternalVideoProvider;
  readonly videoId: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

interface ParsedUrl {
  readonly host: string;
  readonly segments: readonly string[];
  readonly query: string;
}

/** Scheme, host, path and query of an http(s) URL; no user info and no port (no video page needs them). */
const URL_PATTERN = /^https?:\/\/([a-z0-9.-]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i;

const parseUrl = (value: string): ParsedUrl | null => {
  const match = URL_PATTERN.exec(value.trim());
  if (!match) return null;
  return { host: match[1]!.toLowerCase(), segments: (match[2] ?? '').split('/').filter(Boolean), query: match[3] ?? '' };
};

const queryParam = (query: string, name: string): string | null => {
  const pair = query.split('&').find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
};

const youtubeIdOf = (url: ParsedUrl): string | null => {
  if (url.host === 'youtu.be') return url.segments[0] ?? null;
  if (!YOUTUBE_HOSTS.has(url.host)) return null;
  const [kind, id] = url.segments;
  if (kind === 'watch' && url.segments.length === 1) return queryParam(url.query, 'v');
  return kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v' ? (id ?? null) : null;
};

const vimeoIdOf = (url: ParsedUrl): string | null => {
  if (!VIMEO_HOSTS.has(url.host)) return null;
  if (url.host === 'player.vimeo.com') return url.segments[0] === 'video' ? (url.segments[1] ?? null) : null;
  return url.segments.find((segment) => VIMEO_ID.test(segment)) ?? null;
};

/** The provider and id of a YouTube or Vimeo link, or null for anything else. */
export function parseExternalVideoUrl(value: string): ExternalVideo | null {
  const url = parseUrl(value);
  if (!url) return null;
  const youtube = youtubeIdOf(url);
  if (youtube !== null && YOUTUBE_ID.test(youtube)) return { provider: 'youtube', videoId: youtube };
  const vimeo = vimeoIdOf(url);
  if (vimeo !== null && VIMEO_ID.test(vimeo)) return { provider: 'vimeo', videoId: vimeo };
  return null;
}

/** The address of the player, built from the id only (it is validated again: the id comes from stored data). */
export function externalEmbedUrl(video: ExternalVideo): string | null {
  if (video.provider === 'youtube') {
    return YOUTUBE_ID.test(video.videoId) ? `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1` : null;
  }
  return VIMEO_ID.test(video.videoId) ? `https://player.vimeo.com/video/${video.videoId}?autoplay=1&dnt=1` : null;
}

/** A link to watch the video on the provider's site (for visitors who prefer it). */
export function externalWatchUrl(video: ExternalVideo): string | null {
  if (video.provider === 'youtube') return YOUTUBE_ID.test(video.videoId) ? `https://www.youtube.com/watch?v=${video.videoId}` : null;
  return VIMEO_ID.test(video.videoId) ? `https://vimeo.com/${video.videoId}` : null;
}

/** Origins the page may frame, and only after a click: the CSP `frame-src` lists exactly these. */
export const EXTERNAL_VIDEO_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'] as const;
