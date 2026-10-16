import { STAGE_TITLE_MAX, type StageType } from '@candydati/domain';
import type { BuilderJob } from '../../package-builder.js';
import type { WorkableStage } from './client.js';

/** Only kinds with an unambiguous counterpart get a type; Workable's generic `interview` has none. */
const STAGE_TYPE_OF_KIND: Readonly<Record<string, StageType>> = {
  'phone-screen': 'screening_call',
  assessment: 'take_home_assignment',
  offer: 'offer',
};

/** The account's pipeline (`/stages`), shared by every job, with the lookups the mapping needs. */
export interface StageLookup {
  readonly stages: NonNullable<BuilderJob['stages']>;
  /** The stage a Workable name, slug or action names, or null. */
  resolve(...names: readonly (string | null | undefined)[]): string | null;
  /** The first stage of a kind, else the first stage of the pipeline. */
  fallback(kind: string | null | undefined): string;
  kindOf(ref: string): string | null;
}

const key = (value: string): string => value.trim().toLowerCase();

const DEFAULT_STAGES: readonly WorkableStage[] = [{ slug: 'applied', name: 'Applied', kind: 'applied', position: 0 }];

export function createStageLookup(source: readonly WorkableStage[]): StageLookup {
  const ordered = [...(source.length > 0 ? source : DEFAULT_STAGES)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const unique = ordered.filter((stage, index) => ordered.findIndex((other) => other.slug === stage.slug) === index);
  const stages = unique.map((stage) => {
    const type = STAGE_TYPE_OF_KIND[stage.kind ?? ''];
    return { ref: stage.slug, name: Array.from(stage.name.trim() || stage.slug).slice(0, STAGE_TITLE_MAX).join(''), ...(type === undefined ? {} : { type }) };
  });
  const byName = new Map(unique.map((stage) => [key(stage.name), stage.slug] as const));
  const bySlug = new Map(unique.map((stage) => [key(stage.slug), stage.slug] as const));
  const kinds = new Map(unique.map((stage) => [stage.slug, stage.kind ?? null] as const));
  const first = unique[0]?.slug ?? 'applied';
  return {
    stages,
    resolve: (...names) => {
      for (const name of names) {
        if (name === null || name === undefined) continue;
        const found = byName.get(key(name)) ?? bySlug.get(key(name));
        if (found !== undefined) return found;
      }
      return null;
    },
    fallback: (kind) => unique.find((stage) => kind !== null && kind !== undefined && stage.kind === kind)?.slug ?? first,
    kindOf: (ref) => kinds.get(ref) ?? null,
  };
}
