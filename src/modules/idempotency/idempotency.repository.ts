import { Injectable } from '@nestjs/common';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Executor } from '../../infra/db/client.js';
import { idempotencyRecords } from '../../infra/db/schema.js';

export interface StoredResponse {
  readonly requestHash: string;
  readonly status: number;
  readonly body: unknown;
}

export interface NewRecord extends StoredResponse {
  readonly apiKeyId: string;
  readonly key: string;
  readonly expiresAt: Date;
}

@Injectable()
export class IdempotencyRepository {
  /** Expired records are ignored even before cleanup removes them. */
  async find(db: Executor, apiKeyId: string, key: string): Promise<StoredResponse | null> {
    const [row] = await db
      .select({
        requestHash: idempotencyRecords.requestHash,
        status: idempotencyRecords.responseStatus,
        body: idempotencyRecords.responseBody,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.apiKeyId, apiKeyId),
          eq(idempotencyRecords.idemKey, key),
          gt(idempotencyRecords.expiresAt, sql`now()`),
        ),
      );
    return row ?? null;
  }

  /** Must run in the same transaction as the ledger entry; the unique constraint settles races. */
  async insert(tx: Executor, record: NewRecord): Promise<void> {
    // An expired leftover with the same key would otherwise trip the unique constraint.
    await tx
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.apiKeyId, record.apiKeyId),
          eq(idempotencyRecords.idemKey, record.key),
          lte(idempotencyRecords.expiresAt, sql`now()`),
        ),
      );
    await tx.insert(idempotencyRecords).values({
      apiKeyId: record.apiKeyId,
      idemKey: record.key,
      requestHash: record.requestHash,
      responseStatus: record.status,
      responseBody: record.body,
      expiresAt: record.expiresAt,
    });
  }

  async deleteExpired(db: Executor): Promise<number> {
    const deleted = await db
      .delete(idempotencyRecords)
      .where(lte(idempotencyRecords.expiresAt, sql`now()`))
      .returning({ id: idempotencyRecords.id });
    return deleted.length;
  }
}
