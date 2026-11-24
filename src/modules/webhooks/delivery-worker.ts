import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { WebhookDomainError } from '../../domain/webhooks/errors.js';
import { sign } from '../../domain/webhooks/signature.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { QueueService, type DeliveryJob } from '../../infra/queue/queue.module.js';
import { MetricsService } from '../observability/metrics.service.js';
import { DeliveriesRepository, type DeliveryContext } from './deliveries.repository.js';
import { HttpSender, SendError } from './http-sender.js';
import { SecretVault } from './secret-vault.js';
import { TargetGuard } from './target-guard.js';

interface Outcome {
  readonly statusCode: number | null;
  /** Short error code, or null on success. Never a response body or secret. */
  readonly error: string | null;
}

const errorCode = (error: unknown): string =>
  error instanceof WebhookDomainError || error instanceof SendError ? error.code : 'INTERNAL_ERROR';

@Injectable()
export class DeliveryWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeliveryWorker.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly database: DatabaseService,
    private readonly deliveries: DeliveriesRepository,
    private readonly vault: SecretVault,
    private readonly guard: TargetGuard,
    private readonly sender: HttpSender,
    private readonly queue: QueueService,
    private readonly metrics: MetricsService,
  ) {}

  onApplicationBootstrap(): void {
    this.queue.startWorker((job) => this.process(job));
  }

  /** Throwing asks BullMQ for a retry with the domain backoff; the last attempt marks the delivery failed. */
  async process(job: Job<DeliveryJob>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    const db = this.database.db;
    const context = await this.deliveries.findContext(db, job.data.deliveryId);
    // The relay enqueues before its transaction commits; a miss here is retried.
    if (context === null) throw new Error('DELIVERY_NOT_FOUND');
    const { delivery, endpoint } = context;
    if (delivery.status !== 'pending') return;

    if (!endpoint.active) {
      await this.fail(delivery.id, {
        attempts: attempt,
        statusCode: null,
        error: 'ENDPOINT_INACTIVE',
        final: true,
      });
      return;
    }
    const outcome = await this.attempt(context);
    if (outcome.error === null && outcome.statusCode !== null) {
      await this.deliveries.markDelivered(db, delivery.id, attempt, outcome.statusCode);
      this.metrics.webhookDeliveries.inc({ status: 'delivered' });
      return;
    }
    const error = outcome.error ?? 'INTERNAL_ERROR';
    await this.fail(delivery.id, {
      attempts: attempt,
      statusCode: outcome.statusCode,
      error,
      final: attempt >= this.env.WEBHOOK_MAX_ATTEMPTS,
    });
    throw new Error(error);
  }

  private async fail(
    id: string,
    failure: Parameters<DeliveriesRepository['markFailedAttempt']>[2],
  ): Promise<void> {
    await this.deliveries.markFailedAttempt(this.database.db, id, failure);
    if (!failure.final) return;
    this.metrics.webhookDeliveries.inc({ status: 'failed' });
    this.logger.warn(`Delivery ${id} failed after ${failure.attempts} attempts: ${failure.error}`);
  }

  private async attempt({ event, endpoint }: DeliveryContext): Promise<Outcome> {
    try {
      const target = await this.guard.resolve(endpoint.url);
      const body = JSON.stringify({
        id: event.id,
        type: event.eventType,
        createdAt: event.createdAt.toISOString(),
        data: event.payload,
      });
      const secret = this.vault.decrypt(endpoint.secretCiphertext);
      const statusCode = await this.sender.post(
        target,
        {
          'Austral-Signature': sign(secret, Math.floor(Date.now() / 1000), body),
          'Austral-Event-Id': event.id,
          'Austral-Event-Type': event.eventType,
          'User-Agent': 'AustralLedger-Webhooks/1',
        },
        body,
      );
      const ok = statusCode >= 200 && statusCode < 300;
      return { statusCode, error: ok ? null : `HTTP_${statusCode}` };
    } catch (error) {
      return { statusCode: null, error: errorCode(error) };
    }
  }
}
