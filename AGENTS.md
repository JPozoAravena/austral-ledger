# Austral Ledger

Double-entry wallet ledger API for Monedero Austral SpA (fictional fintech paying delivery riders and platform workers). Portfolio project.

## Stack

NestJS 12 (ESM) + strict TypeScript, PostgreSQL + Drizzle ORM, Redis (idempotency locks, rate limit, BullMQ), zod, Vitest + Testcontainers + Supertest, k6, Docker Compose, Terraform (kreuzwerker/docker), GitHub Actions + SonarQube Cloud + CodeQL + Trivy + Dependabot. Node 26.13.1. Zero cost.

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
- Every entry sums to 0, enforced by a DB constraint.
- Postings are immutable: a trigger blocks UPDATE and DELETE. Reversals are compensating entries.
- Transfers use `SELECT ... FOR UPDATE` ordered by id. USER_WALLET never goes negative.
- Idempotency-Key: Redis lock with SET NX + TTL; the final truth is a unique constraint in PostgreSQL. Same body returns the same response; different body 422; in progress 409.
- Webhooks: transactional outbox -> BullMQ worker -> HMAC-SHA256 signature `t=...,v1=...`, retries with backoff.
- API keys are hashed, with scopes (platform, user, ops, auditor) and BOLA checks on every endpoint.
- Logs: pino with correlation-id. `/health`, `/metrics` (prom-client), OpenAPI at `/docs`.

## Commands

- `npm run build` / `start` / `start:dev`
- `npm run lint` (zero warnings), `format`, `typecheck`
- `npm test` (unit + e2e), `test:cov`, `test:e2e`
- `docker compose up --build` (needs `.env`, see `.env.example`)

## Conventions

- Conventional Commits in English (`feat:`, `fix:`, `chore:`...).
- One branch per phase; PRs include `Closes #N` (issues #1 to #8 are phases 1 to 8).
- Validate input at the boundary with zod; parameterized queries only; no secrets in code or logs.
- Never use type casts (`as`, `!`, `any`) to silence the type checker; fix the types instead.
