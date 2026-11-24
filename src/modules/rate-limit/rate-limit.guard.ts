import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../common/api-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Principal } from '../auth/principal.js';
import { MetricsService } from '../observability/metrics.service.js';
import { RateLimiter } from './rate-limiter.js';
import { rateLimitState } from './rate-limit-state.js';
import { SKIP_RATE_LIMIT_KEY } from './skip-rate-limit.js';

interface LimitedRequest {
  readonly method: string;
  readonly ip?: string;
  readonly principal?: Principal;
}

interface LimitedResponse {
  setHeader(name: string, value: string | number): unknown;
}

/** Runs after AuthGuard (module order), so authenticated callers are limited per API key and the rest per IP. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(SKIP_RATE_LIMIT_KEY, targets)) {
      return true;
    }
    const http = context.switchToHttp();
    const request = http.getRequest<LimitedRequest>();
    const response = http.getResponse<LimitedResponse>();

    const isPost = request.method === 'POST';
    const limit = isPost ? this.env.RATE_LIMIT_POST_MAX : this.env.RATE_LIMIT_MAX;
    const subject = request.principal?.keyId ?? request.ip ?? 'unknown';
    const hit = await this.limiter.hit(
      `rl:${isPost ? 'post' : 'any'}:${subject}`,
      this.env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
    if (hit === null) return true;

    const state = rateLimitState(hit.count, hit.ttlMs, limit);
    response.setHeader('RateLimit-Limit', state.limit);
    response.setHeader('RateLimit-Remaining', state.remaining);
    response.setHeader('RateLimit-Reset', state.reset);
    if (!state.limited) return true;
    response.setHeader('Retry-After', state.reset);
    this.metrics.rateLimited.inc();
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, retry later');
  }
}
