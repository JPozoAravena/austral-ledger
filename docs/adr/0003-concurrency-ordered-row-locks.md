# ADR 0003: Concurrency control with ordered row locks

- Status: accepted
- Date: 2026-11-24

## Context

Two transfers can touch the same accounts at once, in opposite directions. Reading a balance and writing it later would allow overdrafts and lost updates, and naive locking would deadlock.

## Decision

- `LedgerService.postEntry` locks every affected account with `SELECT ... FOR UPDATE`, **ordered by account id**, so concurrent transactions acquire locks in the same order and cannot deadlock.
- The domain balance policy runs after the locks and before any write: `USER_WALLET` never goes negative (`INSUFFICIENT_FUNDS`).
- Entry, postings and balance updates happen in one transaction.
- Integration tests (Testcontainers) run concurrent transfers and assert that balances and the trial balance stay consistent.

## Consequences

- Throughput is serialized per account, not globally. Hot accounts (for example the funding account) are the bottleneck to watch.
- The policy lives in the pure domain layer, so it is unit-tested without a database.

## Alternatives

- **Optimistic locking with retries:** fewer locks, but more retries under contention and harder to reason about for money.
- **`SERIALIZABLE` isolation:** simple to write, but serialization failures need retry logic everywhere.
