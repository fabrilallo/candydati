import type { MigrationSource, MigrationSourceCatalog } from '@candydati/core';
import { migrationConnectorDtoSchema } from '@candydati/domain';
import type { MigrationConnector } from './connector.js';
import { teamtailorConnector } from './sources/teamtailor/index.js';

/** The connectors this instance offers, by id. Also the core's catalog (what to list, the credential schemas). */
export interface MigrationConnectorRegistry extends MigrationSourceCatalog {
  get(id: string): MigrationConnector | undefined;
}

/**
 * Built-in vendor connectors (Phase 6, each task adds its own here). Test-only connectors are never listed here (see
 * `@candydati/providers/testing`).
 */
export const BUILT_IN_MIGRATION_CONNECTORS: readonly MigrationConnector[] = [teamtailorConnector as MigrationConnector];

/** Checks every connector's public description and that ids are unique, at startup. */
export function createConnectorRegistry(connectors: readonly MigrationConnector[] = BUILT_IN_MIGRATION_CONNECTORS): MigrationConnectorRegistry {
  const byId = new Map<string, MigrationConnector>();
  for (const connector of connectors) {
    const described = migrationConnectorDtoSchema.safeParse({ id: connector.id, label: connector.label, maturity: connector.maturity, input: connector.input, docsUrl: connector.docsUrl, fields: connector.fields });
    if (!described.success) throw new Error(`Migration connector "${connector.id}" is badly described.`);
    if (byId.has(connector.id)) throw new Error(`Migration connector "${connector.id}" is registered twice.`);
    byId.set(connector.id, connector);
  }
  const sources: readonly MigrationSource[] = [...byId.values()];
  return {
    list: () => sources,
    find: (id) => byId.get(id),
    get: (id) => byId.get(id),
  };
}
