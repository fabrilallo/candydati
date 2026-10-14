import sharp from 'sharp';

/**
 * Abstract "photographs" for the careers page, generated locally (no downloads, no people): a soft gradient with
 * out-of-focus light discs, like a bokeh shot of an office at dusk. Seeded, so every run produces the same images.
 */

export interface Palette {
  /** Background gradient, top-left to bottom-right. */
  readonly from: string;
  readonly to: string;
  /** Colours of the light discs. */
  readonly lights: readonly string[];
}

export const PALETTES = {
  dusk: { from: '#0f1d4a', to: '#3a2a5c', lights: ['#ffd29a', '#ff9f6b', '#9fb8ff', '#ffe9c4'] },
  morning: { from: '#dfe8f5', to: '#f7e7d4', lights: ['#ffffff', '#ffd9a8', '#b9d0ff', '#fff3e0'] },
  garden: { from: '#163a2e', to: '#5b7a3a', lights: ['#f4e7a1', '#d7f0b4', '#ffffff', '#ffd27f'] },
  cobalt: { from: '#0b1f6b', to: '#1f47d6', lights: ['#8fb1ff', '#ffffff', '#c7d6ff', '#ffcf8a'] },
  terracotta: { from: '#5a2a1f', to: '#c46a3c', lights: ['#ffe0b8', '#ffb37a', '#fff4e3', '#f7c59f'] },
  slate: { from: '#1c2430', to: '#45566e', lights: ['#e9eef5', '#a9c1e0', '#ffd8a6', '#ffffff'] },
} as const satisfies Record<string, Palette>;

/** Mulberry32: tiny deterministic PRNG. */
const prng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const disc = (random: () => number, width: number, height: number, colors: readonly string[], index: number): string => {
  const radius = (0.03 + random() ** 2 * 0.16) * width;
  const x = random() * width;
  // Lights gather in a band across the frame, as in a real out-of-focus street or office.
  const y = height * (0.25 + random() * 0.55);
  const color = colors[index % colors.length]!;
  const opacity = (0.18 + random() * 0.5).toFixed(2);
  return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${radius.toFixed(0)}" fill="url(#light-${index % colors.length})" fill-opacity="${opacity}" stroke="${color}" stroke-opacity="0.12" stroke-width="2"/>`;
};

const svgOf = (palette: Palette, width: number, height: number, seed: number): string => {
  const random = prng(seed);
  const gradients = palette.lights
    .map((color, index) => `<radialGradient id="light-${index}"><stop offset="0" stop-color="${color}" stop-opacity="1"/><stop offset="0.7" stop-color="${color}" stop-opacity="0.75"/><stop offset="1" stop-color="${color}" stop-opacity="0.15"/></radialGradient>`)
    .join('');
  const discs = Array.from({ length: 46 }, (_, index) => disc(random, width, height, palette.lights, index)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/></linearGradient>
      <radialGradient id="glow" cx="0.7" cy="0.35" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      ${gradients}
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    ${discs}
  </svg>`;
};

/** A JPEG of `width`×`height`, blurred like a wide-open lens. No grain: smooth images keep the README screenshots small. */
export const bokehImage = async (palette: Palette, seed: number, width = 2400, height = 1500): Promise<Buffer> =>
  sharp(Buffer.from(svgOf(palette, width, height, seed)))
    .blur(Math.max(4, width / 220))
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
