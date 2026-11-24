# Austral Ledger

Double-entry wallet ledger API for Monedero Austral SpA (fictional fintech paying delivery riders and platform workers). Portfolio project.

## Stack

NestJS 12 (ESM) + strict TypeScript, PostgreSQL + Drizzle ORM, Redis (idempotency locks, rate limit, BullMQ), zod, Vitest + Testcontainers + Supertest, k6, Docker Compose, Terraform (kreuzwerker/docker), GitHub Actions + SonarQube Cloud + CodeQL + Trivy + Dependabot. Node 26.13.1. Zero cost.

SonarQube Cloud runs secretless via GitHub OIDC (no long-lived tokens).

Dependencies are pinned to exact versions (`.npmrc` `save-exact=true`). TypeScript is held at 6.0.x until typescript-eslint supports 7.

## Architecture

- `src/domain`: pure logic, no Nest.
- `src/modules/{accounts,ledger,transfers,payouts,idempotency,rate-limit,webhooks,auth,reports,health}`: Nest modules.
- `src/infra/{db,redis,queue}`: infrastructure adapters.
- `src/config`: zod-validated env.
- `test/{unit,integration,e2e}`, `load/k6`, `infra/terraform`, `docs/adr`.

Layers depend in one direction only: presentation -> application -> domain -> infrastructure. No cycles. Files stay around 200 lines. No dead code, no debug logs.

ESM: relative imports need the `.js` extension.

## Domain rules

- Amounts are BIGINT integer CLP.
- Sign convention: debit is positive, credit is negative. `accounts.balance` is the natural balance (positive on the account's normal side): debit-normal = sum of postings, credit-normal = negated sum.
- Every entry sums to 0 and has at least 2 postings, enforced by a deferred constraint trigger (SQLSTATE AL001). An account appears at most once per entry.
- Postings are immutable: triggers block UPDATE, DELETE and TRUNCATE (SQLSTATE AL002). Reversals are compensating entries.
- Transfers use `SELECT ... FOR UPDATE` ordered by id. USER_WALLET never goes negative.
- Idempotency-Key: Redis lock with SET NX + TTL; the final truth is a unique constraint in PostgreSQL. Same body returns the same response; different body 422; in progress 409.
- Webhooks: transactional outbox -> BullMQ worker -> HMAC-SHA256 signature `t=...,v1=...`, retries with backoff.
  - Events (`transfer.completed`, `funding.completed`, `payout.requested`, `payout.paid`) are inserted via `OutboxRepository` in the same `tx` as the entry. Amounts are strings.
  - The relay (`OutboxRelay`, `FOR UPDATE SKIP LOCKED`) creates one `webhook_deliveries` row per active endpoint and enqueues a job with `jobId = deliveryId`. `UNIQUE(event_id, endpoint_id)` is the final dedupe.
  - The worker runs only in `src/worker.ts` (`npm run start:worker`, compose service `worker`, metrics on `WORKER_METRICS_PORT`); the API never runs it. Retries use `backoffDelayMs` (exponential + jitter) up to `WEBHOOK_MAX_ATTEMPTS`, then the delivery is `failed`.
  - Endpoint secrets are shown once (`whsec_...`) and stored AES-256-GCM encrypted with `WEBHOOK_SECRET_KEY`. SSRF: https only and no private/loopback/link-local IPs, checked at registration and again on every send (connecting to the resolved IP); `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` is for dev and tests only.
  - Receivers verify with `npm run webhook:verify` (`scripts/`, standalone copy of the domain `verify`).
- API keys: `al_<scope>_<43 base64url chars>`, stored as HMAC-SHA256 with `API_KEY_PEPPER` (min 32 chars), looked up by prefix (scope + 12 random chars), compared with `timingSafeEqual`. `Authorization: Bearer`; 401 invalid, 403 wrong scope. Endpoints need `@Scopes(...)` or `@Public()`; anything else is rejected.
- BOLA (`src/modules/auth/access-policy.ts`): ops all, auditor read-only all, platform its `platform_ref`, user its `owner_ref`. No access answers 404, never 403.
- Money moves only through `LedgerService.postEntry(tx, entry)`: locks accounts ordered by id, applies the domain balance policy (INSUFFICIENT_FUNDS before writing), then inserts entry, postings and balances. Entries are built with `src/domain/ledger/movements.ts`.
- HTTP: errors are `{ error: { code, message } }` (LedgerError -> 422, ACCOUNT_NOT_FOUND -> 404); bigint is serialized as string; request bodies are validated with `ZodValidationPipe` and documented in `/docs` from the same zod schema (`ApiZodBody`).
- Idempotency money endpoints (`/v1/transfers`, `/fundings`, `/payouts`, `/payouts/:id/settle`) require `Idempotency-Key`; `IdempotencyService.respond` runs the handler in one transaction that also inserts the `idempotency_records` row (services take `tx`). Redis lock and rate limit fail open.
- Rate limit: fixed window in Redis (Lua), per API key or IP, stricter for POST; `/health` and `/metrics` use `@SkipRateLimit()`.
- Logs: pino with correlation-id. `/health`, `/metrics` (prom-client), OpenAPI at `/docs`.

## Commands

- `npm run idempotency:cleanup` deletes expired idempotency records
- `npm run build` / `start` / `start:dev` / `start:worker`
- `npm run lint` (zero warnings), `format`, `typecheck`
- `npm test` (unit + e2e), `test:integration` (Testcontainers, needs Docker), `test:cov` (all), `test:e2e`
- `npm run db:generate` (drizzle-kit; use `npx drizzle-kit generate --custom` for hand-written SQL), `db:migrate` (builds, then applies `src/infra/db/migrations` using `DATABASE_URL`)
- `npm run seed` (builds, creates the 4 system accounts idempotently and prints a new ops API key once, only if no active ops key exists)
- `docker compose up --build` (needs `.env`, see `.env.example`)

## Conventions

- Conventional Commits in English (`feat:`, `fix:`, `chore:`...).
- One branch per phase; PRs include `Closes #N` (issues #1 to #8 are phases 1 to 8).
- Validate input at the boundary with zod; parameterized queries only; no secrets in code or logs.
- Never use type casts (`as`, `!`, `any`) to silence the type checker; fix the types instead.
