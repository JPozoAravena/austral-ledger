import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveryWorker } from './delivery-worker.js';
import { HttpSender } from './http-sender.js';
import { OutboxModule } from './outbox.module.js';
import { OutboxRelay } from './outbox-relay.js';
import { WebhookCoreModule } from './webhook-core.module.js';

/** Relay plus delivery worker. Only the worker process imports this module. */
@Module({
  imports: [WebhookCoreModule, OutboxModule, QueueModule],
  providers: [DeliveriesRepository, HttpSender, OutboxRelay, DeliveryWorker],
})
export class WebhookWorkerModule {}
