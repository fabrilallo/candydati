import { and, desc, eq, lt, schema, sql } from '@candydati/db';
import type { WebhookEndpoint } from '@candydati/domain';
import type { WebhookDeliveryRepository, WebhookEndpointRepository } from '../webhook-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.webhookEndpoint.$inferSelect;

const toEndpoint = (row: Row): WebhookEndpoint => ({ ...row });

/** Postgres implementation. The secret is stored as is (it has to sign); no query selects it for a listing DTO. */
export function createDrizzleWebhookEndpoints(db: DbExecutor): WebhookEndpointRepository {
  const { webhookEndpoint } = schema;
  const inOrg = (organizationId: string) => eq(webhookEndpoint.organizationId, organizationId);
  return {
    async create(endpoint) {
      const [row] = await db.insert(webhookEndpoint).values({ ...endpoint, events: [...endpoint.events] }).returning();
      if (!row) throw new Error('webhook endpoint insert returned no row');
      return toEndpoint(row);
    },
    async save(endpoint) {
      const { id, organizationId, ...values } = endpoint;
      const [row] = await db
        .update(webhookEndpoint)
        .set({ ...values, events: [...values.events] })
        .where(and(inOrg(organizationId), eq(webhookEndpoint.id, id)))
        .returning();
      if (!row) throw new Error('webhook endpoint not found for save');
      return toEndpoint(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(webhookEndpoint).where(and(inOrg(organizationId), eq(webhookEndpoint.id, id))).limit(1);
      return row ? toEndpoint(row) : null;
    },
    async list(organizationId) {
      const rows = await db.select().from(webhookEndpoint).where(inOrg(organizationId)).orderBy(desc(webhookEndpoint.createdAt), desc(webhookEndpoint.id));
      return rows.map(toEndpoint);
    },
    async listForEvent(organizationId, type) {
      const rows = await db
        .select()
        .from(webhookEndpoint)
        .where(and(inOrg(organizationId), eq(webhookEndpoint.enabled, true), sql`${type} = any(${webhookEndpoint.events})`));
      return rows.map(toEndpoint);
    },
    async delete(organizationId, id) {
      const rows = await db.delete(webhookEndpoint).where(and(inOrg(organizationId), eq(webhookEndpoint.id, id))).returning({ id: webhookEndpoint.id });
      return rows.length > 0;
    },
  };
}

export function createDrizzleWebhookDeliveries(db: DbExecutor): WebhookDeliveryRepository {
  const { webhookDelivery } = schema;
  return {
    async append(delivery) {
      await db.insert(webhookDelivery).values(delivery);
      return delivery;
    },
    async hasSucceeded(organizationId, endpointId, eventId) {
      const rows = await db
        .select({ id: webhookDelivery.id })
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.organizationId, organizationId),
            eq(webhookDelivery.endpointId, endpointId),
            eq(webhookDelivery.eventId, eventId),
            eq(webhookDelivery.status, 'success'),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    listByEndpoint: (organizationId, endpointId, limit) =>
      db
        .select()
        .from(webhookDelivery)
        .where(and(eq(webhookDelivery.organizationId, organizationId), eq(webhookDelivery.endpointId, endpointId)))
        .orderBy(desc(webhookDelivery.createdAt), desc(webhookDelivery.id))
        .limit(limit),
    async prune(before) {
      const removed = await db.delete(webhookDelivery).where(lt(webhookDelivery.createdAt, before)).returning({ id: webhookDelivery.id });
      return removed.length;
    },
  };
}
