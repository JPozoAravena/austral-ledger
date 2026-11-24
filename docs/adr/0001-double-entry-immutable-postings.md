# ADR 0001: Double-entry ledger with immutable postings

- Status: accepted
- Date: 2026-11-24

## Context

The service moves money for riders and platform workers. Balances must be explainable and auditable at any point in time, and a bug must never silently create or destroy money.

## Decision

- Every movement is an **entry** with two or more **postings**. Amounts are `BIGINT` integer CLP; there are no decimals or floats.
- Sign convention: debit is positive, credit is negative. Every entry sums to 0 and an account appears at most once per entry.
- `accounts.balance` is the natural balance (positive on the account's normal side) and is updated in the same transaction as the postings.
- PostgreSQL enforces the invariants, not only the application: a deferred constraint trigger rejects entries that do not sum to 0 or have fewer than 2 postings (SQLSTATE `AL001`), and triggers block `UPDATE`, `DELETE` and `TRUNCATE` on postings (SQLSTATE `AL002`).
- Corrections are **compensating entries** (`POST /v1/entries/:id/reverse`): one reversal per entry (unique constraint), reversals cannot be reversed, payout entries use `POST /v1/payouts/:id/fail`.
- Money moves only through `LedgerService.postEntry(tx, entry)`; entries are built with the pure helpers in `src/domain/ledger/movements.ts`.

## Consequences

- The history is append-only, so reconciliation and the trial balance (`GET /v1/reports/trial-balance`) are plain SQL aggregations.
- A direct SQL write that breaks the invariant fails at commit, even if it bypasses the API.
- Fixing a mistake costs an extra entry instead of an edit; this is intended.

## Alternatives

- **Mutable balances only:** simpler, but not auditable and impossible to reconcile after a bug.
- **Application-level checks only:** a second writer (script, migration) could break the invariant unnoticed.
