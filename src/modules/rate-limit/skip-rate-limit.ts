import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'rate-limit:skip';

/** Exempts an endpoint from rate limiting (health checks and metrics scrapes). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
