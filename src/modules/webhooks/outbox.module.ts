import { Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';

/** Transactional outbox: callers insert events with the same `tx` that posts the ledger entry. */
@Module({ providers: [OutboxRepository], exports: [OutboxRepository] })
export class OutboxModule {}
