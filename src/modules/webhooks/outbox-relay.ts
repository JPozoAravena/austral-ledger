import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { QueueService } from '../../infra/queue/queue.module.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { EndpointsRepository, type EndpointRecord } from './endpoints.repository.js';
import { OutboxRepository } from './outbox.repository.js';

const BATCH_SIZE = 50;

/**
 * Polls the outbox and fans each event out to the platform's active endpoints.
 * Locking uses SKIP LOCKED, so several relays can run side by side without duplicates.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly database: DatabaseService,
    private readonly outbox: OutboxRepository,
    private readonly endpoints: EndpointsRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly queue: QueueService,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(this.env.OUTBOX_POLL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.current;
  }

  /** Relays one batch in a single transaction and returns how many events it published. */
  relayOnce(): Promise<number> {
    return this.database.db.transaction(async (tx) => {
      const events = await this.outbox.lockUnpublished(tx, BATCH_SIZE);
      if (events.length === 0) return 0;
      const platforms = [...new Set(events.map((event) => event.platformRef))];
      const byPlatform = new Map<string, EndpointRecord[]>();
      for (const endpoint of await this.endpoints.listActiveByPlatforms(tx, platforms)) {
        byPlatform.set(endpoint.platformRef, [
          ...(byPlatform.get(endpoint.platformRef) ?? []),
          endpoint,
        ]);
      }
      const rows = events.flatMap((event) =>
        (byPlatform.get(event.platformRef) ?? []).map((endpoint) => ({
          eventId: event.id,
          endpointId: endpoint.id,
        })),
      );
      await this.queue.enqueueDeliveries(await this.deliveries.insertMany(tx, rows));
      await this.outbox.markPublished(
        tx,
        events.map((event) => event.id),
      );
      return events.length;
    });
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.current = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let delay = this.env.OUTBOX_POLL_MS;
    try {
      // A full batch means more is probably waiting.
      if ((await this.relayOnce()) === BATCH_SIZE) delay = 0;
    } catch (error) {
      this.logger.warn(`Outbox relay failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
    this.schedule(delay);
  }
}
