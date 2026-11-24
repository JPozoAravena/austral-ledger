import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  // A private registry per instance keeps several apps in one process (tests) from clashing.
  private readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly ledgerEntriesPosted = new Counter({
    name: 'ledger_entries_posted_total',
    help: 'Journal entries posted, by kind',
    labelNames: ['kind'],
    registers: [this.registry],
  });
  readonly idempotencyReplays = new Counter({
    name: 'idempotency_replays_total',
    help: 'Responses served from a stored idempotency record',
    registers: [this.registry],
  });
  readonly rateLimited = new Counter({
    name: 'rate_limited_total',
    help: 'Requests rejected by the rate limiter',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
