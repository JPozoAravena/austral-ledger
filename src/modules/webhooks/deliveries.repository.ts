import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../infra/db/client.js';
import { outboxEvents, webhookDeliveries, webhookEndpoints } from '../../infra/db/schema.js';
import type { EndpointRecord } from './endpoints.repository.js';
import type { OutboxEventRecord } from './outbox.repository.js';

export interface DeliveryContext {
  readonly delivery: typeof webhookDeliveries.$inferSelect;
  readonly event: OutboxEventRecord;
  readonly endpoint: EndpointRecord;
}

export interface FailedAttempt {
  readonly attempts: number;
  readonly statusCode: number | null;
  readonly error: string;
  /** True when no retries remain. */
  readonly final: boolean;
}

@Injectable()
export class DeliveriesRepository {
  /** Returns the ids that were actually created; existing (event, endpoint) pairs are skipped. */
  async insertMany(
    db: Executor,
    rows: readonly { eventId: string; endpointId: string }[],
  ): Promise<string[]> {
    if (rows.length === 0) return [];
    const created = await db
      .insert(webhookDeliveries)
      .values([...rows])
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.id });
    return created.map((row) => row.id);
  }

  async findContext(db: Executor, id: string): Promise<DeliveryContext | null> {
    const [row] = await db
      .select({
        delivery: webhookDeliveries,
        event: outboxEvents,
        endpoint: webhookEndpoints,
      })
      .from(webhookDeliveries)
      .innerJoin(outboxEvents, eq(outboxEvents.id, webhookDeliveries.eventId))
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .where(eq(webhookDeliveries.id, id));
    return row ?? null;
  }

  async markDelivered(
    db: Executor,
    id: string,
    attempts: number,
    statusCode: number,
  ): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        attempts,
        lastStatusCode: statusCode,
        lastError: null,
        deliveredAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, id));
  }

  async markFailedAttempt(db: Executor, id: string, failure: FailedAttempt): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status: failure.final ? 'failed' : 'pending',
        attempts: failure.attempts,
        lastStatusCode: failure.statusCode,
        lastError: failure.error,
      })
      .where(eq(webhookDeliveries.id, id));
  }
}
