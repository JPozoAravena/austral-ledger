# ADR 0005: Hashed API keys, scopes and an object-level access policy

- Status: accepted
- Date: 2026-11-24

## Context

The API is called by machines (operations, auditors, platforms) and by user-facing backends. A leaked database must not leak usable credentials, and one tenant must never read another's accounts (BOLA).

## Decision

- API keys look like `al_<scope>_<43 base64url chars>`. Only an HMAC-SHA256 with a server-side pepper (`API_KEY_PEPPER`, at least 32 chars) is stored. Lookup is by a short prefix; the hash is compared with `timingSafeEqual`.
- `Authorization: Bearer`; 401 for an invalid key, 403 for a wrong scope. Every endpoint needs `@Scopes(...)` or `@Public()`; anything else is rejected.
- `src/modules/auth/access-policy.ts` decides object access: ops see everything, auditor sees everything read-only, platform sees its `platform_ref`, user sees its `owner_ref`.
- A caller without access gets **404, never 403**, so resource existence is not leaked.
- A fixed-window rate limit in Redis (per key or IP, stricter for POST) also fails open.

## Consequences

- Keys cannot be recovered, only rotated; losing the pepper invalidates every key.
- A fast HMAC is acceptable because keys are high-entropy random values, unlike passwords, which would need argon2 or bcrypt.

## Alternatives

- **Plain or reversible storage:** a database leak would expose live credentials.
- **JWTs:** no instant revocation without extra state, and no benefit for server-to-server clients.
