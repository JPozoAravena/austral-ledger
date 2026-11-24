import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { unauthorized } from '../../common/api-error.js';
import type { Principal } from '../auth/principal.js';
import { fingerprint } from './fingerprint.js';
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from './idempotency-key.js';
import type { IdempotencyContext } from './idempotency.service.js';

interface IdempotentRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal?: Principal;
}

/** Builds the idempotency context from the authenticated principal, the header and the request fingerprint. */
export const Idempotent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdempotencyContext => {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    if (request.principal === undefined) throw unauthorized();
    return {
      apiKeyId: request.principal.keyId,
      key: parseIdempotencyKey(request.headers[IDEMPOTENCY_HEADER]),
      requestHash: fingerprint(request.method, request.path, request.body),
    };
  },
);
