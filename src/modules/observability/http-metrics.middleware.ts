import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

type RoutedRequest = IncomingMessage & { route?: { path?: unknown } };

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: RoutedRequest, res: ServerResponse, next: () => void): void {
    const start = process.hrtime.bigint();
    res.once('finish', () => {
      // The route pattern (not the URL) keeps label cardinality bounded.
      const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      this.metrics.httpDuration.observe(
        { method: req.method ?? 'UNKNOWN', route, status: String(res.statusCode) },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    });
    next();
  }
}
