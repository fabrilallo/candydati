/** Path segments GitHub Pages and custom domains can serve: letters, digits, dot, dash, underscore. */
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

/**
 * Public path the site is served under, from `DOCS_BASE`: `/` on a custom domain, `/<repository>/` on
 * `<user>.github.io`. Always starts and ends with a slash, as VitePress expects.
 */
export function docsBase(env: Readonly<Record<string, string | undefined>>): string {
  const raw = env['DOCS_BASE']?.trim() ?? '';
  const segments = raw.split('/').filter((part) => part !== '');
  if (segments.length === 0) return '/';
  if (!segments.every((part) => SEGMENT.test(part))) {
    throw new Error('DOCS_BASE must be a path such as /candydati/ (letters, digits, ".", "-", "_").');
  }
  return `/${segments.join('/')}/`;
}
