import { Injectable } from '@nestjs/common';
import { asc, inArray, isNull } from 'drizzle-orm';
import type { WebhookEventType } from '../../domain/webhooks/events.js';
import type { Executor } from '../../infra/db/client.js';
import { outboxEvents } from '../../infra/db/schema.js';

export type OutboxEventRecord = typeof outboxEvents.$inferSelect;

export interface NewOutboxEvent {
  readonly eventType: WebhookEventType;
  readonly aggregateId: string;
  /** Wallets without a platform have no one to notify, so the event is dropped. */
  readonly platformRef: string | null;
  /** Amounts are strings: BIGINT does not fit in JSON numbers. */
  readonly payload: Record<string, string>;
}

@Injectable()
export class OutboxRepository {
  async insert(db: Executor, event: NewOutboxEvent): Promise<void> {
    if (event.platformRef === null) return;
    await db.insert(outboxEvents).values({ ...event, platformRef: event.platformRef });
  }

  /** Locks a batch of pending events; concurrent relays skip rows another relay holds. */
  lockUnpublished(db: Executor, limit: number): Promise<OutboxEventRecord[]> {
    return db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });
  }

  async markPublished(db: Executor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(outboxEvents)
      .set({ publishedAt: new Date() })
      .where(inArray(outboxEvents.id, [...ids]));
  }
}
