import { Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { backoffDelayMs } from '../../domain/webhooks/backoff.js';

export const DELIVERY_QUEUE = 'webhook-deliveries';

export interface DeliveryJob {
  readonly deliveryId: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<DeliveryJob>;
  private readonly workers: Worker<DeliveryJob>[] = [];
  private readonly logger = new Logger(QueueService.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    // BullMQ blocks on this connection, so commands must never time out.
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.name}`);
    });
    this.queue = new Queue<DeliveryJob>(DELIVERY_QUEUE, { connection: this.connection });
  }

  /** `jobId = deliveryId` makes re-enqueueing the same delivery a no-op. */
  async enqueueDeliveries(deliveryIds: readonly string[]): Promise<void> {
    if (deliveryIds.length === 0) return;
    await this.queue.addBulk(
      deliveryIds.map((deliveryId) => ({
        name: 'deliver',
        data: { deliveryId },
        opts: {
          jobId: deliveryId,
          attempts: this.env.WEBHOOK_MAX_ATTEMPTS,
          backoff: { type: 'custom' },
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }

  /** The processor throws to request a retry; the delay comes from the domain backoff policy. */
  startWorker(processor: (job: Job<DeliveryJob>) => Promise<void>): void {
    const worker = new Worker<DeliveryJob>(DELIVERY_QUEUE, processor, {
      connection: this.connection,
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          backoffDelayMs(attemptsMade, this.env.WEBHOOK_BACKOFF_MS),
      },
    });
    worker.on('error', (error: Error) => {
      this.logger.warn(`Worker error: ${error.name}`);
    });
    this.workers.push(worker);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await this.queue.close();
    if (this.connection.status === 'ready') await this.connection.quit();
    else this.connection.disconnect();
  }
}

@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
