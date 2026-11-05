import { ConflictError } from '../errors.js';
import type { SkillAliasRecord, SkillAliasRepository } from '../skill-alias-ports.js';
import { cell, type Cell } from './in-memory-transaction.js';

export interface SkillAliasStoreState {
  readonly aliases: readonly SkillAliasRecord[];
  /** `organizationId:aliasKey`. */
  readonly disabled: readonly string[];
}

export type SkillAliasStore = Cell<SkillAliasStoreState>;

export const createSkillAliasStore = (initial: Partial<SkillAliasStoreState> = {}): SkillAliasStore => cell<SkillAliasStoreState>({ aliases: [], disabled: [], ...initial });

const disabledKey = (organizationId: string, aliasKey: string): string => `${organizationId}:${aliasKey}`;

/** The in-memory twin of the Postgres repository: same scoping by organization, same unique alias key. */
export function createInMemorySkillAliases(store: SkillAliasStore = createSkillAliasStore()): SkillAliasRepository {
  return {
    async load(organizationId) {
      const prefix = `${organizationId}:`;
      return {
        aliases: store
          .get()
          .aliases.filter((alias) => alias.organizationId === organizationId)
          .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
        disabled: store
          .get()
          .disabled.filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length)),
      };
    },
    async add(record) {
      if (store.get().aliases.some((alias) => alias.organizationId === record.organizationId && alias.aliasKey === record.aliasKey)) throw new ConflictError('alias_taken');
      store.set({ ...store.get(), aliases: [...store.get().aliases, record] });
      return record;
    },
    async remove(organizationId, id) {
      const found = store.get().aliases.find((alias) => alias.organizationId === organizationId && alias.id === id) ?? null;
      if (found !== null) store.set({ ...store.get(), aliases: store.get().aliases.filter((alias) => alias !== found) });
      return found;
    },
    async disable(organizationId, aliasKey) {
      const key = disabledKey(organizationId, aliasKey);
      if (store.get().disabled.includes(key)) return false;
      store.set({ ...store.get(), disabled: [...store.get().disabled, key] });
      return true;
    },
    async enable(organizationId, aliasKey) {
      const key = disabledKey(organizationId, aliasKey);
      if (!store.get().disabled.includes(key)) return false;
      store.set({ ...store.get(), disabled: store.get().disabled.filter((other) => other !== key) });
      return true;
    },
  };
}
