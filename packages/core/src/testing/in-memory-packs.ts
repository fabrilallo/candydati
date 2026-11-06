import type { AutomationPack, AutomationPackRule } from '@candydati/domain';
import type { AutomationPackRepository, JobTemplatePackRepository } from '../pack-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryAutomationPacks extends AutomationPackRepository {
  snapshot(): { readonly packs: readonly AutomationPack[]; readonly rules: readonly AutomationPackRule[] };
}

const oldestFirst = (items: readonly AutomationPackRule[]): readonly AutomationPackRule[] => items.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

export function createInMemoryAutomationPacks(initial: { packs?: readonly AutomationPack[] | undefined; rules?: readonly AutomationPackRule[] | undefined } = {}): InMemoryAutomationPacks {
  const packs = cell<readonly AutomationPack[]>([...(initial.packs ?? [])]);
  const rules = cell<readonly AutomationPackRule[]>([...(initial.rules ?? [])]);
  const packsOf = (organizationId: string) => packs.get().filter((p) => p.organizationId === organizationId);
  const rulesOf = (organizationId: string) => rules.get().filter((r) => r.organizationId === organizationId);
  const same = (a: { organizationId: string; id: string }, b: { organizationId: string; id: string }) => a.organizationId === b.organizationId && a.id === b.id;
  return {
    async create(pack) {
      packs.set([...packs.get(), pack]);
      return pack;
    },
    async save(pack) {
      packs.set(packs.get().map((p) => (same(p, pack) ? pack : p)));
      return pack;
    },
    async findById(organizationId, id) {
      return packsOf(organizationId).find((p) => p.id === id) ?? null;
    },
    async findByName(organizationId, name) {
      return packsOf(organizationId).find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;
    },
    async list(organizationId) {
      return packsOf(organizationId).toSorted((a, b) => a.name.localeCompare(b.name));
    },
    async delete(organizationId, id) {
      const exists = packsOf(organizationId).some((p) => p.id === id);
      packs.set(packs.get().filter((p) => !(p.organizationId === organizationId && p.id === id)));
      rules.set(rules.get().filter((r) => !(r.organizationId === organizationId && r.packId === id)));
      return exists;
    },
    async countRules(organizationId) {
      return rulesOf(organizationId).reduce<Record<string, number>>((counts, r) => ({ ...counts, [r.packId]: (counts[r.packId] ?? 0) + 1 }), {});
    },
    async createRule(rule) {
      rules.set([...rules.get(), rule]);
      return rule;
    },
    async saveRule(rule) {
      rules.set(rules.get().map((r) => (same(r, rule) ? rule : r)));
      return rule;
    },
    async findRule(organizationId, id) {
      return rulesOf(organizationId).find((r) => r.id === id) ?? null;
    },
    async listRules(organizationId, packId) {
      return oldestFirst(rulesOf(organizationId).filter((r) => r.packId === packId));
    },
    async deleteRule(organizationId, id) {
      const exists = rulesOf(organizationId).some((r) => r.id === id);
      rules.set(rules.get().filter((r) => !(r.organizationId === organizationId && r.id === id)));
      return exists;
    },
    snapshot: () => ({ packs: packs.get(), rules: rules.get() }),
  };
}

interface Link {
  readonly organizationId: string;
  readonly templateId: string;
  readonly packId: string;
  readonly position: number;
}

export function createInMemoryJobTemplatePacks(initial: readonly Link[] = []): JobTemplatePackRepository {
  const links = cell<readonly Link[]>([...initial]);
  const linksOf = (organizationId: string) => links.get().filter((l) => l.organizationId === organizationId);
  return {
    async listByTemplate(organizationId, templateId) {
      return linksOf(organizationId)
        .filter((l) => l.templateId === templateId)
        .toSorted((a, b) => a.position - b.position)
        .map((l) => l.packId);
    },
    async templatesByPack(organizationId) {
      return linksOf(organizationId).reduce<Record<string, readonly string[]>>((byPack, l) => ({ ...byPack, [l.packId]: [...(byPack[l.packId] ?? []), l.templateId] }), {});
    },
    async replace(organizationId, templateId, packIds) {
      const kept = links.get().filter((l) => !(l.organizationId === organizationId && l.templateId === templateId));
      links.set([...kept, ...packIds.map((packId, position) => ({ organizationId, templateId, packId, position }))]);
    },
  };
}
