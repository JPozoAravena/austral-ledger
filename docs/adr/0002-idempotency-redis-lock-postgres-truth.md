# ADR 0002: Idempotency with a Redis lock and PostgreSQL as the source of truth

- Status: accepted
- Date: 2026-11-24

## Context

Clients retry on timeouts. A retried transfer, funding or payout must not move money twice, and a retry with a different body must not be mistaken for the original.

## Decision

- Money endpoints (`/v1/transfers`, `/v1/fundings`, `/v1/payouts`, `/v1/payouts/:id/settle`) require an `Idempotency-Key` header.
- A Redis `SET NX` with TTL is a fast lock that keeps concurrent duplicates out. If Redis is down the lock **fails open**.
- The final truth is a unique constraint on `idempotency_records` in PostgreSQL. `IdempotencyService.respond` runs the handler and inserts the record in the **same transaction**, so the effect and its record commit or roll back together.
- Same key and same body returns the stored response; same key and a different body returns 422; a request still in progress returns 409.
- Expired records are removed by `npm run idempotency:cleanup`.

## Consequences

- Correctness never depends on Redis; Redis only reduces contention.
- Each request stores a hash of its body and the response, which costs some storage until cleanup runs.

## Alternatives

- **Redis only:** a lost key or a failover would allow a duplicate payment.
- **PostgreSQL only:** correct, but concurrent duplicates would all do the work and fail at commit.
