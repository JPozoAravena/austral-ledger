import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Executor } from '../../infra/db/client.js';
import { payouts } from '../../infra/db/schema.js';

export type PayoutRecord = typeof payouts.$inferSelect;

export interface NewPayout {
  readonly accountId: string;
  readonly amount: bigint;
  readonly destination: string;
  readonly entryId: string;
}

@Injectable()
export class PayoutsRepository {
  async insert(db: Executor, payout: NewPayout): Promise<PayoutRecord> {
    const [row] = await db.insert(payouts).values(payout).returning();
    if (!row) throw new Error('Payout insert returned no row');
    return row;
  }

  async findById(db: Executor, id: string): Promise<PayoutRecord | null> {
    const [row] = await db.select().from(payouts).where(eq(payouts.id, id));
    return row ?? null;
  }

  /** Locks the row so two concurrent settlements cannot both pass the status check. */
  async findByIdForUpdate(db: Executor, id: string): Promise<PayoutRecord | null> {
    const [row] = await db.select().from(payouts).where(eq(payouts.id, id)).for('update');
    return row ?? null;
  }

  async markPaid(db: Executor, id: string, settlementEntryId: string): Promise<PayoutRecord> {
    const [row] = await db
      .update(payouts)
      .set({ status: 'paid', settlementEntryId, updatedAt: new Date() })
      .where(eq(payouts.id, id))
      .returning();
    if (!row) throw new Error('Payout update returned no row');
    return row;
  }

  async markFailed(db: Executor, id: string): Promise<PayoutRecord> {
    const [row] = await db
      .update(payouts)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(payouts.id, id))
      .returning();
    if (!row) throw new Error('Payout update returned no row');
    return row;
  }
}
