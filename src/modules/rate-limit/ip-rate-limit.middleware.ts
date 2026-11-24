import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MetricsService } from '../observability/metrics.service.js';
import { RateLimiter } from './rate-limiter.js';
import { rateLimitState } from './rate-limit-state.js';

interface IpRequest {
  readonly ip?: string;
  readonly originalUrl: string;
}

interface IpResponse {
  setHeader(name: string, value: string | number): unknown;
}

const EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health', '/metrics']);

/**
 * Pre-auth bucket per client IP. Runs before guards, so invalid or missing API keys are
 * throttled too (they never reach the per-key RateLimitGuard).
 */
@Injectable()
export class IpRateLimitMiddleware implements NestMiddleware<IpRequest, IpResponse> {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly limiter: RateLimiter,
    private readonly metrics: MetricsService,
  ) {}

  async use(request: IpRequest, response: IpResponse, next: () => void): Promise<void> {
    if (EXEMPT_PATHS.has(request.originalUrl.split('?')[0] ?? '')) return next();
    const hit = await this.limiter.hit(
      `rl:ip:${request.ip ?? 'unknown'}`,
      this.env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
    if (hit === null) return next();
    const state = rateLimitState(hit.count, hit.ttlMs, this.env.RATE_LIMIT_IP_MAX);
    if (!state.limited) return next();
    response.setHeader('Retry-After', state.reset);
    this.metrics.rateLimited.inc();
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, retry later');
  }
}
