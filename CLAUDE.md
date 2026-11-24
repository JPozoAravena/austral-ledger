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
- API keys are hashed, with scopes (platform, user, ops, auditor) and BOLA checks on every endpoint.
- Logs: pino with correlation-id. `/health`, `/metrics` (prom-client), OpenAPI at `/docs`.

## Commands

- `npm run build` / `start` / `start:dev`
- `npm run lint` (zero warnings), `format`, `typecheck`
- `npm test` (unit + e2e), `test:integration` (Testcontainers, needs Docker), `test:cov` (all), `test:e2e`
- `npm run db:generate` (drizzle-kit; use `npx drizzle-kit generate --custom` for hand-written SQL), `db:migrate` (builds, then applies `src/infra/db/migrations` using `DATABASE_URL`)
- `docker compose up --build` (needs `.env`, see `.env.example`)

## Conventions

- Conventional Commits in English (`feat:`, `fix:`, `chore:`...).
- One branch per phase; PRs include `Closes #N` (issues #1 to #8 are phases 1 to 8).
- Validate input at the boundary with zod; parameterized queries only; no secrets in code or logs.
- Never use type casts (`as`, `!`, `any`) to silence the type checker; fix the types instead.
