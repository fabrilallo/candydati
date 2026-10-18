import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

/**
 * Bound `href` and `src` values that are NOT built from stored data: paths made by our own helpers, mailto/tel links
 * (the scheme is fixed by the template) or operator configuration. Anything else must go through `safeExternalUrl` or
 * `safeLogoUrl`, otherwise a `javascript:` value stored by a stranger becomes script on this origin.
 */
const SAFE_BY_CONSTRUCTION = [
  /^safeExternalUrl\(/,
  // An https address, or a file of the public media route (`lib/safe-url.ts`).
  /^safeLogoUrl\(/,
  // Careers page media: only same-origin paths of the public media route (`lib/careers-site.ts`).
  /^safeMediaUrl\(/,
  // YouTube (nocookie) or Vimeo player built from a validated id, loaded only after a click.
  /^safeEmbedUrl\(/,
  /^`mailto:/,
  /^`tel:/,
  /^cvUrl\(/,
  // Same-origin download path of an attachment, ids encoded (`lib/candidate-api.ts`).
  /^attachmentUrl\(/,
  /^candidateExportUrl\(/,
  /^dataExportUrl\(/,
  /^publicPath$/,
  /^feed$/,
  /^llms$/,
  /^src$/,
  /^props\.csvUrl$/,
  // otpauth:// address the api generates for the signed-in user's own two-factor enrolment.
  /^enrolment\.totpUri$/,
  // SVG data URL drawn in the browser by `totpQrDataUrl` from that same address.
  /^qrCode$/,
  /^OPENAPI_PATH$/,
  // Fixed https pages of the AI providers' consoles, a static map keyed by the chosen provider (`lib/ai-models.ts`).
  /^apiKeyUrl\(/,
]

const BOUND = /(?:v-bind)?:(?:href|src)="([^"]+)"/g

describe('links built from data in templates', () => {
  const offenders = vueFiles(join(ROOT, 'components')).concat(vueFiles(join(ROOT, 'pages')), vueFiles(join(ROOT, 'layouts'))).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return [...source.matchAll(BOUND)]
      .map((match) => match[1]!.trim())
      .filter((expression) => !SAFE_BY_CONSTRUCTION.some((pattern) => pattern.test(expression)))
      .map((expression) => `${relative(ROOT, file)}: ${expression}`)
  })

  it('binds href and src only to safe values', () => {
    expect(offenders).toEqual([])
  })
})
