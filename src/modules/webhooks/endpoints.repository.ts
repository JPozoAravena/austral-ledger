import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../infra/db/client.js';
import { webhookEndpoints } from '../../infra/db/schema.js';

export type EndpointRecord = typeof webhookEndpoints.$inferSelect;

const LIST_LIMIT = 100;

@Injectable()
export class EndpointsRepository {
  async insert(
    db: Executor,
    endpoint: { platformRef: string; url: string; secretCiphertext: string },
  ): Promise<EndpointRecord> {
    const [row] = await db.insert(webhookEndpoints).values(endpoint).returning();
    if (!row) throw new Error('Webhook endpoint insert returned no row');
    return row;
  }

  listByPlatform(db: Executor, platformRef: string): Promise<EndpointRecord[]> {
    return db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.platformRef, platformRef))
      .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.id))
      .limit(LIST_LIMIT);
  }

  listActiveByPlatforms(db: Executor, platformRefs: readonly string[]): Promise<EndpointRecord[]> {
    if (platformRefs.length === 0) return Promise.resolve([]);
    return db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          inArray(webhookEndpoints.platformRef, [...platformRefs]),
          eq(webhookEndpoints.active, true),
        ),
      );
  }

  /** Returns false when the endpoint does not exist or belongs to another platform. */
  async deactivate(db: Executor, id: string, platformRef: string): Promise<boolean> {
    const rows = await db
      .update(webhookEndpoints)
      .set({ active: false })
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.platformRef, platformRef)))
      .returning({ id: webhookEndpoints.id });
    return rows.length > 0;
  }
}
