import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { ObservabilityModule } from './modules/observability/observability.module.js';
import { WebhookWorkerModule } from './modules/webhooks/webhook-worker.module.js';

/** Root of the worker process: no HTTP API, only the outbox relay and the delivery worker. */
@Module({ imports: [ConfigModule, ObservabilityModule, DatabaseModule, WebhookWorkerModule] })
export class WorkerModule {}
