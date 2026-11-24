import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // Secret mixed into the API key HMAC; losing it invalidates every issued key.
  API_KEY_PEPPER: z.string().min(32),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  IDEMPOTENCY_LOCK_TTL_MS: z.coerce.number().int().min(100).default(30_000),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  // Stricter bucket for POST (money-moving) requests.
  RATE_LIMIT_POST_MAX: z.coerce.number().int().min(1).default(30),
  // Pre-auth bucket per client IP (also throttles invalid API keys).
  RATE_LIMIT_IP_MAX: z.coerce.number().int().min(1).default(300),
  // Express "trust proxy" hop count; 0 = use the socket IP. Never "true" (X-Forwarded-For spoofing).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  // AES-256 key (32 bytes, base64) that encrypts webhook secrets at rest.
  WEBHOOK_SECRET_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be 32 bytes encoded as base64'),
  // Dev and tests only: allows http and private, loopback or link-local webhook targets.
  WEBHOOK_ALLOW_PRIVATE_TARGETS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OUTBOX_POLL_MS: z.coerce.number().int().min(10).default(1000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  WEBHOOK_BACKOFF_MS: z.coerce.number().int().min(1).default(5000),
  // Port of the worker's /metrics endpoint.
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
