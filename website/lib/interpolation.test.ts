import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });

/** Lines with `{{` that Vue would interpolate: outside fenced code blocks and not inside a `v-pre` element. */
const interpolatedLines = (text: string): number[] => {
  let fenced = false;
  return text.split('\n').flatMap((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced || !line.includes('{{')) return [];
    return /<(\w+)[^>]*\bv-pre\b[^>]*>[^<]*\{\{/.test(line) ? [] : [index + 1];
  });
};

describe('docs pages', () => {
  // VitePress compiles every page as a Vue template: `{{x}}` in prose or inline code is an expression, and a failing
  // one renders the page blank while the build still says complete. Placeholders go in <code v-pre>…</code>.
  it('never leave {{ }} for Vue to interpolate', () => {
    const offenders = markdownFiles(ROOT).flatMap((file) =>
      interpolatedLines(readFileSync(file, 'utf8')).map((line) => `${relative(ROOT, file)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
