# ADR 0004: Transactional outbox for webhooks

- Status: accepted
- Date: 2026-11-24

## Context

Integrators need to be told when a transfer, funding or payout happens. Publishing directly after the commit can lose the event, and publishing before it can announce something that rolled back.

## Decision

- Events (`transfer.completed`, `funding.completed`, `payout.requested`, `payout.paid`) are inserted through `OutboxRepository` in the **same transaction** as the entry.
- `OutboxRelay` reads pending events with `FOR UPDATE SKIP LOCKED`, creates one `webhook_deliveries` row per active endpoint and enqueues a BullMQ job with `jobId = deliveryId`. `UNIQUE(event_id, endpoint_id)` is the final deduplication.
- A separate worker process (`src/worker.ts`) sends the requests; the API never runs it. Retries use exponential backoff with jitter up to `WEBHOOK_MAX_ATTEMPTS`, then the delivery is `failed`.
- Payloads are signed with HMAC-SHA256 (`t=...,v1=...`). Endpoint secrets are shown once and stored encrypted with AES-256-GCM.
- SSRF: https only, no private, loopback or link-local addresses, checked at registration and again on every send against the resolved IP.

## Consequences

- Delivery is **at least once**; receivers must deduplicate by event id. `npm run webhook:verify` shows how to check the signature.
- Webhook latency is bounded by the relay poll interval (`OUTBOX_POLL_MS`).

## Alternatives

- **Publish after commit:** can lose events on a crash between commit and publish.
- **Two-phase commit with the queue:** not supported by Redis and not worth the complexity.
