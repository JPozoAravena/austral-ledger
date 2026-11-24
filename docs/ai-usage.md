# AI usage

Austral Ledger was built with Claude Code. The rules it followed are versioned in [`CLAUDE.md`](../CLAUDE.md): architecture, domain invariants, conventions and "never use type casts to silence the type checker". A human set the scope of every phase (one GitHub issue and one branch per phase), reviewed the result and decided what shipped.

## Division of work

| Who           | What                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Human         | Product scope, phase plan, domain rules (sign convention, idempotency semantics, 404 instead of 403), acceptance of each change, all commits and merges. |
| AI            | Implementation of each phase, tests, migrations, CI workflows, documentation drafts.                                                                     |
| Tools, not AI | Lint with zero warnings, strict TypeScript, tests with coverage, SonarQube quality gate, CodeQL, Trivy.                                                  |

## What was checked by tools instead of trust

- Invariants live in PostgreSQL (deferred constraint trigger, immutability triggers, unique constraints), so code written by an AI cannot break them silently.
- Integration tests run against real PostgreSQL and Redis with Testcontainers, including concurrent transfers.
- Dependencies are pinned to exact versions and scanned (Dependabot, Trivy, CodeQL).

## Corrections made after review

Fixes that came from reviewing generated code, taken from the commit history:

| Commit    | Finding                                                                                                         | Decision                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `f6b4579` | Rate limit could be bypassed with invalid keys and trusted spoofable proxy headers                              | Fixed: per-IP bucket before auth and a pinned `TRUST_PROXY_HOPS`                                        |
| `dcf8b6e` | Webhook SSRF filter missed 6to4 and Teredo addresses; zero keys and private targets were accepted in production | Fixed: addresses blocked, zero keys rejected, private targets forbidden in production by the env schema |
| `5e04b20` | Trivy reported HIGH findings from npm in the runtime image                                                      | Fixed: npm removed from the runtime image                                                               |

## Limits of this process

- AI output was reviewed by one person, not by an independent team.
- No external penetration test was done; the security section of the README describes controls, not a certification.
- Generated documentation was edited by a human, but may still contain wording the author did not write from scratch.
